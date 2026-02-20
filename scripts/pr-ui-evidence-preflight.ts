#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const UI_FILE_PATTERNS: RegExp[] = [
    /^web\/src\//,
    /^web\/public\//,
    /^web\/index\.html$/,
    /^web\/tailwind\.config\.[jt]s$/,
    /^web\/postcss\.config\.[cm]?js$/,
    /^web\/.*\.(css|scss|sass|less)$/
]

const MIN_NO_UI_EXPLANATION_LENGTH = 12

type Options = {
    base: string
    bodyFile: string | null
    body: string | null
}

function printHelp(): void {
    console.log(`Usage: bun scripts/pr-ui-evidence-preflight.ts [options]

Checks PR body screenshot/no-UI evidence against UI file changes.
Run this before "gh pr create" / "gh pr edit".

Options:
  --base <ref>        Base ref to diff against (default: origin/main)
  --body-file <path>  Path to PR body markdown file
  --body <text>       Inline PR body text
  --help              Show help

Rules when UI files changed:
  1) Provide screenshot/video evidence in body, OR
  2) Check "No visual/UI changes" AND include:
     No visual/UI changes explanation: <why non-visual>
`)
}

function parseArgs(argv: string[]): Options {
    const options: Options = {
        base: 'origin/main',
        bodyFile: null,
        body: null
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--help' || arg === '-h') {
            printHelp()
            process.exit(0)
        }
        if (arg === '--base') {
            options.base = argv[++i] ?? options.base
            continue
        }
        if (arg === '--body-file') {
            options.bodyFile = argv[++i] ?? null
            continue
        }
        if (arg === '--body') {
            options.body = argv[++i] ?? null
            continue
        }
        throw new Error(`Unknown argument: ${arg}`)
    }

    return options
}

function runGit(args: string[]): string {
    const result = spawnSync('git', args, {
        encoding: 'utf8'
    })

    if (result.status !== 0) {
        const stderr = result.stderr?.trim() || 'git command failed'
        throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
    }

    return result.stdout.trim()
}

function readPrBody(options: Options): string {
    if (options.body && options.body.trim().length > 0) {
        return options.body
    }

    if (options.bodyFile) {
        const absolutePath = resolve(options.bodyFile)
        if (!existsSync(absolutePath)) {
            throw new Error(`Body file not found: ${absolutePath}`)
        }
        return readFileSync(absolutePath, 'utf8')
    }

    return ''
}

function main(): void {
    const options = parseArgs(process.argv.slice(2))

    const mergeBase = runGit(['merge-base', 'HEAD', options.base])
    if (!mergeBase) {
        throw new Error(`Could not determine merge-base for ${options.base}`)
    }

    const changedFilesOutput = runGit(['diff', '--name-only', `${mergeBase}..HEAD`])
    const changedFiles = changedFilesOutput
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean)
    const uiFiles = changedFiles.filter((filename) => UI_FILE_PATTERNS.some((pattern) => pattern.test(filename)))

    if (uiFiles.length === 0) {
        console.log('✅ PR UI evidence preflight passed (no UI files changed).')
        return
    }

    const body = readPrBody(options).replace(/<!--[\s\S]*?-->/g, '')
    if (!body.trim()) {
        console.error('❌ UI files changed but no PR body was provided.')
        console.error('   Use --body-file <path> (recommended) or --body "<markdown>".')
        process.exit(1)
    }

    const hasImageMarkdown = /!\[[^\]]*]\([^)]+\)/.test(body)
    const hasHtmlImage = /<img\s+[^>]*src=/i.test(body)
    const hasMediaLink = /(user-attachments\/assets\/|https?:\/\/\S+\.(png|jpe?g|gif|webp|mp4|webm|mov))/i.test(body)
    const hasNoUiOverride = /-\s*\[[xX]\]\s*no visual\/ui changes/i.test(body)
        || /-\s*\[[xX]\]\s*no ui changes/i.test(body)
    const noUiExplanationMatch = body.match(
        /(?:^|\n)\s*(?:[-*]\s*)?(?:No visual\/UI changes explanation|No UI changes explanation)\s*[:\-]\s*(.+)$/im
    )
    const noUiExplanation = noUiExplanationMatch?.[1]?.trim() ?? ''
    const hasNoUiExplanation = noUiExplanation.length >= MIN_NO_UI_EXPLANATION_LENGTH
    const hasScreenshotEvidence = hasImageMarkdown || hasHtmlImage || hasMediaLink

    if (hasNoUiOverride && !hasNoUiExplanation) {
        console.error('❌ "No visual/UI changes" is checked, but explanation is missing/too short.')
        console.error(`   Add: No visual/UI changes explanation: <at least ${MIN_NO_UI_EXPLANATION_LENGTH} chars>`)
        process.exit(1)
    }

    if (!hasScreenshotEvidence && !hasNoUiOverride) {
        console.error('❌ UI files changed but no screenshot/recording evidence found.')
        console.error('   Add image/video evidence OR check "No visual/UI changes" with explanation.')
        console.error('')
        console.error('Changed UI files (sample):')
        uiFiles.slice(0, 8).forEach((filename) => console.error(`- ${filename}`))
        process.exit(1)
    }

    console.log('✅ PR UI evidence preflight passed.')
}

try {
    main()
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ ${message}`)
    process.exit(1)
}

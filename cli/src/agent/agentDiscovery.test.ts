import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { discoverAgents } from './agentDiscovery'

async function writeFileRecursive(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
}

describe('discoverAgents', () => {
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    let tempRoot = ''
    let claudeConfigDir = ''
    let projectDirectory = ''

    beforeEach(async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'hapi-agent-discovery-'))
        claudeConfigDir = join(tempRoot, 'global-claude')
        projectDirectory = join(tempRoot, 'project')

        await mkdir(claudeConfigDir, { recursive: true })
        await mkdir(projectDirectory, { recursive: true })

        process.env.CLAUDE_CONFIG_DIR = claudeConfigDir
    })

    afterEach(async () => {
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
        }

        if (tempRoot) {
            await rm(tempRoot, { recursive: true, force: true })
        }
    })

    it('discovers global agents', async () => {
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'ops.md'),
            [
                '---',
                'name: ops',
                'description: Handles ops workflows',
                '---',
                '',
                '# Ops agent'
            ].join('\n')
        )

        const agents = await discoverAgents({ directory: projectDirectory })

        expect(agents).toEqual([
            {
                name: 'ops',
                description: 'Handles ops workflows',
                source: 'global'
            }
        ])
    })

    it('project agents override global agents with the same name', async () => {
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'ops.md'),
            [
                '---',
                'name: ops',
                'description: Global ops',
                '---',
                '',
                '# Global ops'
            ].join('\n')
        )
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'reviewer.md'),
            [
                '---',
                'name: reviewer',
                'description: Global reviewer',
                '---',
                '',
                '# Reviewer'
            ].join('\n')
        )
        await writeFileRecursive(
            join(projectDirectory, '.claude', 'agents', 'ops.md'),
            [
                '---',
                'name: ops',
                'description: Project ops',
                '---',
                '',
                '# Project ops'
            ].join('\n')
        )

        const agents = await discoverAgents({ directory: projectDirectory })

        expect(agents).toEqual([
            {
                name: 'ops',
                description: 'Project ops',
                source: 'project'
            },
            {
                name: 'reviewer',
                description: 'Global reviewer',
                source: 'global'
            }
        ])
    })

    it('skips hidden agents and lets hidden project agents suppress global ones', async () => {
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'ops.md'),
            [
                '---',
                'name: ops',
                'description: Global ops',
                '---',
                '',
                '# Ops'
            ].join('\n')
        )
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'private.md'),
            [
                '---',
                'name: private',
                'description: Hidden global agent',
                'hidden: true',
                '---',
                '',
                '# Hidden'
            ].join('\n')
        )
        await writeFileRecursive(
            join(projectDirectory, '.claude', 'agents', 'ops.md'),
            [
                '---',
                'name: ops',
                'hidden: true',
                '---',
                '',
                '# Hide ops in this project'
            ].join('\n')
        )
        await writeFileRecursive(
            join(projectDirectory, '.claude', 'agents', 'analyst.md'),
            [
                '---',
                'name: analyst',
                'description: Project analyst',
                '---',
                '',
                '# Analyst'
            ].join('\n')
        )

        const agents = await discoverAgents({ directory: projectDirectory })

        expect(agents).toEqual([
            {
                name: 'analyst',
                description: 'Project analyst',
                source: 'project'
            }
        ])
    })

    it('skips malformed files and files missing frontmatter name', async () => {
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'no-frontmatter.md'),
            '# Plain markdown without frontmatter'
        )
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'missing-name.md'),
            [
                '---',
                'description: Missing name field',
                '---',
                '',
                '# Missing name'
            ].join('\n')
        )
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'invalid-yaml.md'),
            [
                '---',
                'name: [broken',
                '---',
                '',
                '# Invalid yaml'
            ].join('\n')
        )
        await writeFileRecursive(
            join(claudeConfigDir, 'agents', 'valid.md'),
            [
                '---',
                'name: valid-agent',
                'description: Keeps valid files only',
                '---',
                '',
                '# Valid'
            ].join('\n')
        )

        const agents = await discoverAgents({ directory: projectDirectory })

        expect(agents).toEqual([
            {
                name: 'valid-agent',
                description: 'Keeps valid files only',
                source: 'global'
            }
        ])
    })
})

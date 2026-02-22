import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

export type DiscoveredAgent = {
    name: string
    description?: string
    source: 'global' | 'project'
}

type ParsedFrontmatter = {
    name: string
    description?: string
    hidden: boolean
}

type ScannedAgent = DiscoveredAgent & {
    hidden: boolean
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

function parseFrontmatter(fileContent: string): ParsedFrontmatter | null {
    const match = FRONTMATTER_REGEX.exec(fileContent)
    if (!match) {
        return null
    }

    const yamlContent = match[1]
    try {
        const parsed = parseYaml(yamlContent)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null
        }

        const frontmatter = parsed as Record<string, unknown>
        const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : ''
        if (!name) {
            return null
        }

        const description = typeof frontmatter.description === 'string'
            ? frontmatter.description.trim()
            : undefined

        return {
            name,
            description: description ? description : undefined,
            hidden: frontmatter.hidden === true
        }
    } catch {
        return null
    }
}

async function scanDirectory(directory: string, source: DiscoveredAgent['source']): Promise<ScannedAgent[]> {
    try {
        const entries = await readdir(directory, { withFileTypes: true })
        const markdownEntries = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))

        const scanned = await Promise.all(markdownEntries.map(async (entry): Promise<ScannedAgent | null> => {
            try {
                const filePath = join(directory, entry.name)
                const fileContent = await readFile(filePath, 'utf8')
                const parsed = parseFrontmatter(fileContent)
                if (!parsed) {
                    return null
                }

                return {
                    name: parsed.name,
                    description: parsed.description,
                    source,
                    hidden: parsed.hidden
                }
            } catch {
                return null
            }
        }))

        return scanned.filter((agent): agent is ScannedAgent => agent !== null)
    } catch {
        return []
    }
}

export async function discoverAgents(options?: {
    directory?: string
}): Promise<DiscoveredAgent[]> {
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
    const globalAgentsDir = join(claudeConfigDir, 'agents')

    const projectDirectory = typeof options?.directory === 'string'
        ? options.directory.trim()
        : ''
    const projectAgentsDir = projectDirectory
        ? join(projectDirectory, '.claude', 'agents')
        : null

    const [globalAgents, projectAgents] = await Promise.all([
        scanDirectory(globalAgentsDir, 'global'),
        projectAgentsDir ? scanDirectory(projectAgentsDir, 'project') : Promise.resolve([])
    ])

    const byName = new Map<string, DiscoveredAgent>()

    for (const agent of globalAgents) {
        if (agent.hidden) {
            continue
        }

        byName.set(agent.name, {
            name: agent.name,
            description: agent.description,
            source: agent.source
        })
    }

    for (const agent of projectAgents) {
        if (agent.hidden) {
            byName.delete(agent.name)
            continue
        }

        byName.set(agent.name, {
            name: agent.name,
            description: agent.description,
            source: agent.source
        })
    }

    return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name))
}

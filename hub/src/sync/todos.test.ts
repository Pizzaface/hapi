import { describe, expect, it } from 'bun:test'
import { extractTodoWriteTodosFromMessageContent } from './todos'

function wrapAsMessage(role: string, content: unknown) {
    return { role, content }
}

describe('extractTodoWriteTodosFromMessageContent - Claude path', () => {
    it('extracts todos from output -> assistant -> content -> tool_use(TodoWrite)', () => {
        const result = extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    content: [
                        { type: 'text', text: 'planning...' },
                        {
                            type: 'tool_use',
                            name: 'TodoWrite',
                            input: {
                                todos: [
                                    { content: 'Write tests', status: 'pending' }
                                ]
                            }
                        }
                    ]
                }
            }
        }))

        expect(result).toEqual([
            { content: 'Write tests', status: 'pending', priority: 'medium', id: 'todo-1' }
        ])
    })

    it('returns null for invalid Claude envelope variants', () => {
        const cases: Array<{ name: string, content: unknown }> = [
            {
                name: 'non-output type',
                content: {
                    type: 'text',
                    data: {}
                }
            },
            {
                name: 'non-assistant data.type',
                content: {
                    type: 'output',
                    data: {
                        type: 'user',
                        message: { content: [] }
                    }
                }
            },
            {
                name: 'missing content array',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {}
                    }
                }
            },
            {
                name: 'no tool_use blocks',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            content: [
                                { type: 'text', text: 'just text' }
                            ]
                        }
                    }
                }
            },
            {
                name: 'wrong tool name',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            content: [
                                {
                                    type: 'tool_use',
                                    name: 'TaskWrite',
                                    input: {
                                        todos: [{ content: 'ignored', status: 'pending' }]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        ]

        for (const testCase of cases) {
            expect(
                extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', testCase.content)),
                testCase.name
            ).toBeNull()
        }
    })

    it('uses first successful TodoWrite parse when multiple tool_use blocks exist', () => {
        const result = extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'output',
            data: {
                type: 'assistant',
                message: {
                    content: [
                        {
                            type: 'tool_use',
                            name: 'TodoWrite',
                            input: {
                                todos: [{ content: 'missing status' }]
                            }
                        },
                        {
                            type: 'tool_use',
                            name: 'TodoWrite',
                            input: {
                                todos: [{ content: 'Valid second block', status: 'completed' }]
                            }
                        }
                    ]
                }
            }
        }))

        expect(result).toEqual([
            { content: 'Valid second block', status: 'completed', priority: 'medium', id: 'todo-1' }
        ])
    })
})

describe('extractTodoWriteTodosFromMessageContent - Codex path', () => {
    it('extracts todos from codex -> tool-call -> TodoWrite', () => {
        const result = extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'codex',
            data: {
                type: 'tool-call',
                name: 'TodoWrite',
                input: {
                    todos: [
                        { content: 'From codex', status: 'in_progress', priority: 'high', id: 'codex-1' }
                    ]
                }
            }
        }))

        expect(result).toEqual([
            { content: 'From codex', status: 'in_progress', priority: 'high', id: 'codex-1' }
        ])
    })

    it('returns null for invalid Codex envelope variants', () => {
        const cases: Array<{ name: string, content: unknown }> = [
            {
                name: 'non-codex type',
                content: {
                    type: 'output',
                    data: {}
                }
            },
            {
                name: 'non-tool-call data.type',
                content: {
                    type: 'codex',
                    data: {
                        type: 'message'
                    }
                }
            },
            {
                name: 'wrong tool name',
                content: {
                    type: 'codex',
                    data: {
                        type: 'tool-call',
                        name: 'NotTodoWrite',
                        input: { todos: [] }
                    }
                }
            },
            {
                name: 'non-object input',
                content: {
                    type: 'codex',
                    data: {
                        type: 'tool-call',
                        name: 'TodoWrite',
                        input: 'not-an-object'
                    }
                }
            },
            {
                name: 'missing todos',
                content: {
                    type: 'codex',
                    data: {
                        type: 'tool-call',
                        name: 'TodoWrite',
                        input: {}
                    }
                }
            }
        ]

        for (const testCase of cases) {
            expect(
                extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', testCase.content)),
                testCase.name
            ).toBeNull()
        }
    })
})

describe('extractTodoWriteTodosFromMessageContent - ACP path', () => {
    it('extracts todos from codex -> plan -> entries envelope', () => {
        const result = extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'codex',
            data: {
                type: 'plan',
                entries: [
                    { id: 'plan-a', content: 'Plan first', priority: 'high', status: 'pending' },
                    { id: 'plan-b', content: 'Plan second', priority: 'medium', status: 'in_progress' }
                ]
            }
        }))

        expect(result).toEqual([
            { id: 'plan-a', content: 'Plan first', priority: 'high', status: 'pending' },
            { id: 'plan-b', content: 'Plan second', priority: 'medium', status: 'in_progress' }
        ])
    })

    it('drops ACP entries with invalid or missing fields', () => {
        const result = extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'codex',
            data: {
                type: 'plan',
                entries: [
                    { id: 'keep', content: 'Keep me', priority: 'low', status: 'completed' },
                    { id: 'bad-priority', content: 'drop', priority: 'urgent', status: 'pending' },
                    { id: 'bad-status', content: 'drop', priority: 'high', status: 'blocked' },
                    { id: 'empty-content', content: '', priority: 'high', status: 'pending' },
                    { id: 'missing-content', priority: 'high', status: 'pending' },
                    { id: 'missing-priority', content: 'drop', status: 'pending' },
                    { id: 'missing-status', content: 'drop', priority: 'medium' },
                    42
                ]
            }
        }))

        expect(result).toEqual([
            { id: 'keep', content: 'Keep me', priority: 'low', status: 'completed' }
        ])
    })

    it('generates plan-N ids for non-string ids and preserves string ids (empty string becomes todo-N)', () => {
        const result = extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'codex',
            data: {
                type: 'plan',
                entries: [
                    { id: 99, content: 'Numeric id', priority: 'high', status: 'pending' },
                    { id: '', content: 'Empty string id', priority: 'medium', status: 'in_progress' },
                    { id: 'custom-id', content: 'Keep custom', priority: 'low', status: 'completed' }
                ]
            }
        }))

        expect(result).toEqual([
            { id: 'plan-1', content: 'Numeric id', priority: 'high', status: 'pending' },
            { id: 'todo-2', content: 'Empty string id', priority: 'medium', status: 'in_progress' },
            { id: 'custom-id', content: 'Keep custom', priority: 'low', status: 'completed' }
        ])
    })

    it('returns empty array (not null) when all ACP entries are invalid', () => {
        const result = extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'codex',
            data: {
                type: 'plan',
                entries: [
                    { content: '', priority: 'high', status: 'pending' },
                    { content: 'bad priority', priority: 'urgent', status: 'pending' },
                    { content: 'bad status', priority: 'low', status: 'blocked' }
                ]
            }
        }))

        expect(result).toEqual([])
        expect(result).not.toBeNull()
    })
})

describe('extractTodoWriteTodosFromMessageContent - main entrypoint', () => {
    const validClaudeContent = {
        type: 'output',
        data: {
            type: 'assistant',
            message: {
                content: [
                    {
                        type: 'tool_use',
                        name: 'TodoWrite',
                        input: {
                            todos: [{ content: 'From entrypoint', status: 'pending' }]
                        }
                    }
                ]
            }
        }
    }

    it('works through direct { role, content } envelope', () => {
        const result = extractTodoWriteTodosFromMessageContent({
            role: 'assistant',
            content: validClaudeContent
        })

        expect(result).toEqual([
            { content: 'From entrypoint', status: 'pending', priority: 'medium', id: 'todo-1' }
        ])
    })

    it('works through nested { message: { role, content } } envelope', () => {
        const result = extractTodoWriteTodosFromMessageContent({
            message: {
                role: 'assistant',
                content: validClaudeContent
            }
        })

        expect(result).toEqual([
            { content: 'From entrypoint', status: 'pending', priority: 'medium', id: 'todo-1' }
        ])
    })

    it('returns null for user role, system role, and missing role', () => {
        expect(extractTodoWriteTodosFromMessageContent(wrapAsMessage('user', validClaudeContent))).toBeNull()
        expect(extractTodoWriteTodosFromMessageContent(wrapAsMessage('system', validClaudeContent))).toBeNull()
        expect(extractTodoWriteTodosFromMessageContent({ content: validClaudeContent })).toBeNull()
    })

    it('accepts both agent and assistant roles', () => {
        expect(extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', validClaudeContent))).toEqual([
            { content: 'From entrypoint', status: 'pending', priority: 'medium', id: 'todo-1' }
        ])
        expect(extractTodoWriteTodosFromMessageContent(wrapAsMessage('agent', validClaudeContent))).toEqual([
            { content: 'From entrypoint', status: 'pending', priority: 'medium', id: 'todo-1' }
        ])
    })

    it('returns null for non-object content and content without type', () => {
        expect(extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', 'plain text'))).toBeNull()
        expect(extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', { data: {} }))).toBeNull()
    })

    it('returns null for text-only assistant message with unrecognized type', () => {
        expect(extractTodoWriteTodosFromMessageContent(wrapAsMessage('assistant', {
            type: 'text',
            text: 'hello'
        }))).toBeNull()
    })

    it('prefers direct role/content envelope over nested message envelope', () => {
        const result = extractTodoWriteTodosFromMessageContent({
            role: 'assistant',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    message: {
                        content: [
                            {
                                type: 'tool_use',
                                name: 'TodoWrite',
                                input: {
                                    todos: [{ content: 'Direct todo', status: 'pending' }]
                                }
                            }
                        ]
                    }
                }
            },
            message: {
                role: 'assistant',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                        message: {
                            content: [
                                {
                                    type: 'tool_use',
                                    name: 'TodoWrite',
                                    input: {
                                        todos: [{ content: 'Nested todo', status: 'pending' }]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        })

        expect(result).toEqual([
            { content: 'Direct todo', status: 'pending', priority: 'medium', id: 'todo-1' }
        ])
    })
})

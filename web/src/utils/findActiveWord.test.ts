import { describe, expect, it } from 'vitest'
import { findActiveWord, getActiveWordQuery } from './findActiveWord'

describe('findActiveWord', () => {
    // Default prefixes
    const prefixes = ['@', '/']

    describe('Happy Paths', () => {
        it('finds a simple @-word when cursor is at the end', () => {
            const content = 'Hello @user'
            // Cursor after 'r'
            const result = findActiveWord(content, { start: 11, end: 11 }, prefixes)
            expect(result).toEqual({
                word: '@user',
                activeWord: '@user',
                offset: 6,
                length: 5,
                activeLength: 5,
                endOffset: 11
            })
        })

        it('finds a simple /-word when cursor is at the end', () => {
            const content = 'Run /command'
            // Cursor after 'd'
            const result = findActiveWord(content, { start: 12, end: 12 }, prefixes)
            expect(result).toEqual({
                word: '/command',
                activeWord: '/command',
                offset: 4,
                length: 8,
                activeLength: 8,
                endOffset: 12
            })
        })

        it('finds a word when cursor is in the middle', () => {
            const content = 'Hello @username'
            // Cursor after 'r', before 'n' (index 11)
            // H e l l o   @ u s e r | n a m e
            // 0 1 2 3 4 5 6 7 8 9 10 11
            const result = findActiveWord(content, { start: 11, end: 11 }, prefixes)
            expect(result).toEqual({
                word: '@username',
                activeWord: '@user',
                offset: 6,
                length: 9,
                activeLength: 5,
                endOffset: 15
            })
        })

        it('returns just the prefix if cursor is immediately after it', () => {
            const content = 'Type @ here'
            // Cursor after '@' (index 6)
            const result = findActiveWord(content, { start: 6, end: 6 }, prefixes)
            expect(result).toEqual({
                word: '@',
                activeWord: '@',
                offset: 5,
                length: 1,
                activeLength: 1,
                endOffset: 6
            })
        })
    })

    describe('Prefix Specific Behavior', () => {
        it('allows / and . in @-words (file paths)', () => {
            const content = 'Check @src/utils/file.ts'
            // Cursor at end
            const result = findActiveWord(content, { start: 24, end: 24 }, prefixes)
            expect(result).toEqual({
                word: '@src/utils/file.ts',
                activeWord: '@src/utils/file.ts',
                offset: 6,
                length: 18,
                activeLength: 18,
                endOffset: 24
            })
        })

        it('stops at / for non-@ prefixes', () => {
            const content = 'Run /usr/bin'
            // Cursor after 'r' in '/usr'
            const result = findActiveWord(content, { start: 8, end: 8 }, prefixes)
            // Should match '/usr' and stop at '/'
            expect(result).toEqual({
                word: '/usr',
                activeWord: '/usr',
                offset: 4,
                length: 4,
                activeLength: 4,
                endOffset: 8
            })
        })

        it('stops at . for non-@ prefixes', () => {
            const content = 'Run /command.exe'
            // Cursor after 'd'
            const result = findActiveWord(content, { start: 12, end: 12 }, prefixes)
            expect(result).toEqual({
                word: '/command',
                activeWord: '/command',
                offset: 4,
                length: 8,
                activeLength: 8,
                endOffset: 12
            })
        })
    })

    describe('Boundaries', () => {
        it('finds word at start of string', () => {
            const content = '@start'
            const result = findActiveWord(content, { start: 6, end: 6 }, prefixes)
            expect(result).toBeDefined()
            expect(result?.word).toBe('@start')
        })

        it('finds word after newline', () => {
            const content = 'Hello\n@newline'
            // \n is at 5, @ starts at 6
            const result = findActiveWord(content, { start: 14, end: 14 }, prefixes)
            expect(result).toBeDefined()
            expect(result?.word).toBe('@newline')
        })

        it('does NOT find word if prefix is not at boundary (e.g. email)', () => {
            const content = 'email@domain.com'
            // Cursor at end
            const result = findActiveWord(content, { start: 16, end: 16 }, prefixes)
            expect(result).toBeUndefined()
        })
    })

    describe('Stop Characters', () => {
        it('stops at comma', () => {
            const content = 'Hello @user, how are you?'
            // Cursor after 'r'
            const result = findActiveWord(content, { start: 11, end: 11 }, prefixes)
            expect(result).toEqual({
                word: '@user',
                activeWord: '@user',
                offset: 6,
                length: 5,
                activeLength: 5,
                endOffset: 11
            })
        })

        it('stops at parentheses', () => {
            const content = '(@user)'
            // Cursor after 'r'
            const result = findActiveWord(content, { start: 6, end: 6 }, prefixes)
            expect(result).toEqual({
                word: '@user',
                activeWord: '@user',
                offset: 1,
                length: 5,
                activeLength: 5,
                endOffset: 6
            })
        })
    })

    describe('Selection Handling', () => {
        it('returns undefined if text is selected (range selection)', () => {
            const content = 'Hello @user'
            // Select 'use'
            const result = findActiveWord(content, { start: 7, end: 10 }, prefixes)
            expect(result).toBeUndefined()
        })
    })

    describe('No Match Scenarios', () => {
        it('returns undefined if cursor is at start of string with no prefix', () => {
            const content = 'Hello'
            const result = findActiveWord(content, { start: 0, end: 0 }, prefixes)
            expect(result).toBeUndefined()
        })

        it('returns undefined if active word ends with space', () => {
            const content = 'Hello @user '
            // Cursor after space
            const result = findActiveWord(content, { start: 12, end: 12 }, prefixes)
            expect(result).toBeUndefined()
        })

        it('returns undefined if no prefix found backwards', () => {
            const content = 'Hello world'
            const result = findActiveWord(content, { start: 5, end: 5 }, prefixes)
            expect(result).toBeUndefined()
        })
    })
})

describe('getActiveWordQuery', () => {
    it('returns substring after prefix', () => {
        expect(getActiveWordQuery('@user')).toBe('user')
        expect(getActiveWordQuery('/cmd')).toBe('cmd')
    })

    it('returns empty string if only prefix', () => {
        expect(getActiveWordQuery('@')).toBe('')
        expect(getActiveWordQuery('/')).toBe('')
    })
})

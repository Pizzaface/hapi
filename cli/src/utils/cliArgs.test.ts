import { describe, expect, it } from 'vitest';
import { normalizeCliArgs } from './cliArgs';

describe('normalizeCliArgs', () => {
    it('should return an empty array if input is not an array', () => {
        expect(normalizeCliArgs(null as any)).toEqual([]);
        expect(normalizeCliArgs(undefined as any)).toEqual([]);
    });

    it('should return an empty array if input is empty', () => {
        expect(normalizeCliArgs([])).toEqual([]);
    });

    it('should normalize node-style arguments', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = [execPath, 'index.js', 'arg1', 'arg2'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['arg1', 'arg2']);
    });

    it('should normalize node-style arguments with full path to script', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = [execPath, '/path/to/index.js', 'arg1'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['arg1']);
    });

    it('should normalize node-style arguments with basename', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = ['node', 'index.js', 'arg1', 'arg2'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['arg1', 'arg2']);
    });

    it('should normalize bun-style arguments', () => {
        const execPath = '/usr/local/bin/bun';
        const bunMain = '/app/src/index.ts';
        const rawArgv = [execPath, bunMain, 'arg1', 'arg2'];
        expect(normalizeCliArgs(rawArgv, execPath, bunMain)).toEqual(['arg1', 'arg2']);
    });

    it('should normalize bun-style arguments when bunMain is not matched but extension matches', () => {
        const execPath = '/usr/local/bin/bun';
        const bunMain = '/app/src/index.ts';
        const rawArgv = [execPath, 'other.ts', 'arg1'];
        expect(normalizeCliArgs(rawArgv, execPath, bunMain)).toEqual(['arg1']);
    });

    it('should handle "bun" as first argument', () => {
        const execPath = '/usr/local/bin/bun';
        const bunMain = '/app/src/index.ts';
        const rawArgv = ['bun', bunMain, 'arg1'];
        expect(normalizeCliArgs(rawArgv, execPath, bunMain)).toEqual(['arg1']);
    });

    it('should handle -- correctly with runtime wrapper (Node)', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = [execPath, 'index.js', '--', 'arg1', 'arg2'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['arg1', 'arg2']);
    });

    it('should handle -- correctly with runtime wrapper (Bun)', () => {
        const execPath = '/usr/local/bin/bun';
        const bunMain = '/app/src/index.ts';
        const rawArgv = ['bun', '--', 'arg1', 'arg2'];
        expect(normalizeCliArgs(rawArgv, execPath, bunMain)).toEqual(['arg1', 'arg2']);
    });

    it('should handle -- correctly without runtime wrapper', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = ['arg1', '--', 'arg2'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['arg1', 'arg2']);
    });

    it('should not strip arguments that are not runtime/entrypoint', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = ['some-other-binary', 'arg1', 'arg2'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['some-other-binary', 'arg1', 'arg2']);
    });

    it('should handle complex bun arguments', () => {
        const execPath = '/usr/local/bin/bun';
        const bunMain = '/app/src/index.ts';
        const rawArgv = ['bun', bunMain, 'subcommand', '--flag'];
        expect(normalizeCliArgs(rawArgv, execPath, bunMain)).toEqual(['subcommand', '--flag']);
    });

    it('should handle multiple matches at start', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = ['node', 'node', 'index.js', 'arg1'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['arg1']);
    });

    it('should handle empty string arguments', () => {
        const execPath = '/usr/bin/node';
        const rawArgv = ['node', 'index.js', '', 'arg1'];
        expect(normalizeCliArgs(rawArgv, execPath)).toEqual(['', 'arg1']);
    });

    it('should use default values if not provided', () => {
        // This test ensures that when we don't pass the optional arguments, it doesn't crash
        // and uses the actual process.execPath and globalThis.Bun.
        // We can't easily verify the EXACT result without knowing the environment,
        // but we can check that it returns an array.
        const result = normalizeCliArgs(['arg1', 'arg2']);
        expect(Array.isArray(result)).toBe(true);
    });
});

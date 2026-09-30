/**
 * `sigil completion [shell]` command — print shell tab-completion scripts.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { SigilError } from '../errors';

/** No extra options — shell is the positional argument. */
export type CompletionOptions = Record<string, never>;

export function runCompletion(shell = 'bash'): void {
  // process.argv[1] is the CLI entry point — always set when invoked as a command.
  const binPath = process.argv[1] ?? '';

  switch (shell) {
    case 'bash':
      console.log(buildBashCompletion(binPath));
      break;
    case 'zsh':
      console.log(buildZshCompletion(binPath));
      break;
    case 'fish':
      console.log(buildFishCompletion(binPath));
      break;
    default:
      throw new SigilError(`Unknown shell '${shell}'. Valid options: bash, zsh, fish`);
  }
}

export function buildBashCompletion(binPath: string): string {
  return `# sigil bash completion
# Add to ~/.bashrc: eval "$(sigil completion)"
_sigil_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local IFS=$'\\n'
  COMPREPLY=( $(node "${binPath}" __complete "$cur" --prev "$prev" 2>/dev/null) )
  return 0
}
complete -F _sigil_completions sigil`;
}

export function buildZshCompletion(binPath: string): string {
  return `# sigil zsh completion
# Add to ~/.zshrc: eval "$(sigil completion zsh)"
_sigil() {
  local -a completions
  completions=( "\${(@f)$(node "${binPath}" __complete "\${words[-1]}" --prev "\${words[-2]}" 2>/dev/null)}" )
  compadd -a completions
}
compdef _sigil sigil`;
}

export function buildFishCompletion(binPath: string): string {
  return `# sigil fish completion
# Usage: sigil completion fish | source
complete -c sigil -f
complete -c sigil -n '__fish_seen_subcommand_from add' -a "(node ${binPath} __complete (commandline -ct) --prev (commandline -ct | string split ' ' | tail -n2 | head -n1) 2>/dev/null)"`;
}

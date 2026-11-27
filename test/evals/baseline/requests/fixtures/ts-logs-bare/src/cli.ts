const USAGE = 'usage: orders <command>\n\ncommands:\n  help    show this text';

/** The command-line entry point: `main(process.argv.slice(2))`. */
export function main(argv: string[]): void {
  const [command] = argv;
  if (command === undefined || command === 'help') {
    console.log(USAGE);
    return;
  }
  console.error(`unknown command: ${command}`);
  process.exitCode = 1;
}

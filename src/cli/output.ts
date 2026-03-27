import chalk from "chalk";
// ora removed — not needed for CLI-only mode

export function banner(): void {
  console.log(
    chalk.bold.cyan(
      "\n  noob-tester — Automated QA Tester\n"
    )
  );
}

export function phaseHeader(phase: number, name: string): void {
  console.log(
    chalk.bold.yellow(`\n── Phase ${phase}: ${name} ──\n`)
  );
}

export function success(msg: string): void {
  console.log(chalk.green(`✔ ${msg}`));
}

export function warn(msg: string): void {
  console.log(chalk.yellow(`⚠ ${msg}`));
}

export function error(msg: string): void {
  console.log(chalk.red(`✖ ${msg}`));
}

export function info(msg: string): void {
  console.log(chalk.dim(`  ${msg}`));
}


export function summary(lines: Record<string, string | number>): void {
  console.log(chalk.bold("\n── Summary ──\n"));
  for (const [key, val] of Object.entries(lines)) {
    console.log(`  ${chalk.dim(key + ":")} ${val}`);
  }
  console.log();
}

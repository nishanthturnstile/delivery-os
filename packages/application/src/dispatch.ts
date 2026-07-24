import { ApplicationError } from './errors';

export interface Command<TInput, TResult> {
  execute(input: TInput): Promise<TResult>;
}

export class CommandDispatcher {
  private readonly commands = new Map<string, Command<unknown, unknown>>();

  register<TInput, TResult>(name: string, command: Command<TInput, TResult>): void {
    if (this.commands.has(name)) {
      throw new Error(`Command already registered: ${name}`);
    }
    this.commands.set(name, command);
  }

  async dispatch<TResult>(name: string, input: unknown, correlationId: string): Promise<TResult> {
    const command = this.commands.get(name);
    if (command === undefined) {
      throw new ApplicationError({
        code: 'NOT_FOUND',
        message: 'The requested command is not registered.',
        correlationId,
      });
    }
    return (await command.execute(input)) as TResult;
  }
}

export interface Query<TInput, TResult> {
  execute(input: TInput): Promise<TResult>;
}

export class QueryDispatcher extends CommandDispatcher {}

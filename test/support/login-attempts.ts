import type { DataSource } from 'typeorm';

/**
 * Apaga as tentativas de login dos e-mails que um teste usou. Todo login pela API grava uma
 * linha em `login_attempts`, então o teste que faz login a apaga no final, como faz com os
 * usuários que criou.
 */
export async function deleteLoginAttempts(
  dataSource: DataSource | undefined,
  emails: readonly string[],
): Promise<void> {
  if (!dataSource?.isInitialized || emails.length === 0) {
    return;
  }

  await dataSource
    .createQueryBuilder()
    .delete()
    .from('login_attempts')
    .where('email IN (:...emails)', { emails })
    .execute();
}

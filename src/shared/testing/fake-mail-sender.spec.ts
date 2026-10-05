import { MailMessage } from '@shared/application/ports/mail-sender';

import { FakeMailSender } from './fake-mail-sender';

describe('FakeMailSender', () => {
  it('deve guardar as mensagens na ordem de envio', async () => {
    const sut = new FakeMailSender();
    const first: MailMessage = { to: 'a@example.com', subject: 'A', html: '<p>A</p>', text: 'A' };
    const second: MailMessage = { to: 'b@example.com', subject: 'B', html: '<p>B</p>', text: 'B' };

    await sut.send(first);
    await sut.send(second);

    expect(sut.messages).toEqual([first, second]);
  });
});

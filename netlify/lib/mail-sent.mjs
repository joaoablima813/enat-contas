// Guarda uma mensagem já enviada, marcada como lida, na pasta Enviados da caixa (como faria o Outlook).
// A pasta é a que o servidor marca como \Sent, ou IMAP_SENT_FOLDER. Desliga-se com EMAIL_SAVE_SENT=false.
export async function saveSent(c, raw, date = new Date()) {
  if (process.env.EMAIL_SAVE_SENT === 'false') return;
  const { ImapFlow } = await import('imapflow');
  const port = Number(c.imapPort || process.env.IMAP_PORT || 993);
  const client = new ImapFlow({ host: c.imapHost || process.env.IMAP_HOST || c.host || 'mail.enat.pt', port, secure: port === 993, auth: { user: c.user, pass: c.pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  await client.connect();
  try {
    let folder = process.env.IMAP_SENT_FOLDER;
    if (!folder) {
      const list = await client.list();
      folder = list.find((f) => f.specialUse === '\\Sent')?.path
        || list.find((f) => /^(inbox[./])?(sent|sent items|sent messages|enviados|itens enviados|mensagens enviadas)$/i.test(f.path))?.path;
    }
    if (!folder) throw new Error('no Sent folder');
    await client.append(folder, raw, ['\\Seen'], date);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

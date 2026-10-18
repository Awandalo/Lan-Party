// UI intent only: the server still requires current-session recent authentication.
// Never persist this across navigation or use it as authentication proof.
export class GoogleLinkIntent {
  private pending: { session: string; expiresAt: number } | null = null;
  cancel() { this.pending = null; }
  begin(session: string, now = Date.now()) { this.pending = { session, expiresAt: now + 300_000 }; }
  consume(session: string, now = Date.now()) {
    const pending = this.pending;
    this.pending = null;
    return !!pending && pending.session === session && now < pending.expiresAt;
  }
}

import "server-only";
import { signPwToken, pwFingerprint, requestOrigin } from "./account-token";
import { workspaceOrigin } from "./tenant";
import { sendMail } from "./graph";
import { inviteEmail, emailBrand } from "./email";

// Email a new user a secure "set your password" link (24h). Used by admin/control-plane user
// creation so nobody ever hand-sets or transmits a customer's password. Best-effort: never throws.
export async function sendInvite(
  req: Request,
  user: { id: string; email: string },
  opts: { tenantId?: string; workspaceName?: string; inviter?: string } = {},
): Promise<boolean> {
  try {
    // Link to the user's OWN workspace subdomain (not wherever the admin happened to send it from).
    const origin = opts.tenantId ? workspaceOrigin(opts.tenantId) : requestOrigin(req);
    // Invited users are created passwordless — the fingerprint of "no password yet" means the link
    // dies the moment they set one (single-use).
    const url = `${origin}/set-password?token=${encodeURIComponent(signPwToken(user.id, pwFingerprint(null)))}`;
    const mail = inviteEmail(url, { workspaceName: opts.workspaceName, inviter: opts.inviter }, await emailBrand(opts.tenantId));
    return await sendMail(user.email, mail.subject, mail.html, opts.tenantId);
  } catch {
    return false;
  }
}

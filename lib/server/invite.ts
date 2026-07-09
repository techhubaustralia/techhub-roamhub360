import "server-only";
import { signPwToken, requestOrigin } from "./account-token";
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
    const url = `${requestOrigin(req)}/set-password?token=${encodeURIComponent(signPwToken(user.id))}`;
    const mail = inviteEmail(url, { workspaceName: opts.workspaceName, inviter: opts.inviter }, await emailBrand(opts.tenantId));
    return await sendMail(user.email, mail.subject, mail.html, opts.tenantId);
  } catch {
    return false;
  }
}

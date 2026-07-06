# Workspace Hub — Go-Live Runbook (Phases A–E)

Everything below is **ready in code** and builds clean. These are the **Azure / Entra steps** to flip it on. Run in order. Vars:

```powershell
$RG="RG-WorkSpace_Hub-Prod-Eastus"; $APP="ca-workspacehub-prod-eastus"
$ACR="crworkspacehubprodeastus"; $CAE="cae-workspacehub-prod-eastus"
$SQL="sql-workspacehub-prod-eastus"; $SQLDB="sqldb-workspacehub-prod"; $SQLADMIN="whadmin"
$APPID="29c0b446-4e76-4a61-a5ff-c265e5f75ab2"   # existing Entra app reg
$TENANT=az account show --query tenantId -o tsv
```

## 1. Migrate DB (new schema: durations, CheckIn, AuditLog, Lock.scope)
```powershell
cd C:\Projects\workspace-hub
$SQLPWD = Read-Host "SQL password" -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:DATABASE_URL = "sqlserver://$SQL.database.windows.net:1433;database=$SQLDB;user=$SQLADMIN;password={$SQLPWD};encrypt=true;trustServerCertificate=false"
npx prisma db push          # data loss warning OK (prototype) — old bookings table is replaced
```

## 2. Rebuild + redeploy image
```powershell
az acr build -r $ACR -t workspace-hub:v5 -t workspace-hub:latest .
az containerapp update -g $RG -n $APP --image "$ACR.azurecr.io/workspace-hub:v5" -o table
git push
```
**Phase A works after this** (durations, validation, red/green/grey by date, conflict). Phases B/C/D activate once the env + Entra below are set.

## 3. Microsoft Graph — email + room mailboxes (Phase B)
Add **Application** Graph permissions to the app reg, consent, make a secret:
```powershell
# Graph app-permission IDs: Mail.Send=b633e1c5-b582-4048-a93e-9f11b44c7e96,
# Calendars.ReadWrite=ef54d2bf-783f-4e0f-bca1-3210c0444d99, Place.Read.All=913b9306-0ce1-42b8-9137-6a7df690a760
az ad app permission add --id $APPID --api 00000003-0000-0000-c000-000000000000 `
  --api-permissions b633e1c5-b582-4048-a93e-9f11b44c7e96=Role ef54d2bf-783f-4e0f-bca1-3210c0444d99=Role 913b9306-0ce1-42b8-9137-6a7df690a760=Role
az ad app permission admin-consent --id $APPID
$GRAPHSECRET = az ad app credential reset --id $APPID --display-name "graph" --query password -o tsv
```
(Recommended: scope `Mail.Send` to only `sodali.workspace@sodali.com` with an **Exchange Application Access Policy** — see note at bottom.)

Confirm the `sodali.workspace@sodali.com` mailbox exists, and each meeting room has a resource mailbox (e.g. `meetingroom.stamford@sodali.com`).

## 4. Set app env (secrets)
```powershell
az containerapp secret set -g $RG -n $APP --secrets graph-secret="$GRAPHSECRET" checkin-secret="$(New-Guid)" jobs-secret="$(New-Guid)"
az containerapp update -g $RG -n $APP --set-env-vars `
  AZURE_TENANT_ID="$TENANT" GRAPH_CLIENT_ID="$APPID" GRAPH_CLIENT_SECRET=secretref:graph-secret `
  MAIL_FROM="sodali.workspace@sodali.com" GRAPH_TIMEZONE="Eastern Standard Time" `
  APP_URL="https://workspace.sodali.com" `
  CHECKIN_SECRET=secretref:checkin-secret JOBS_SECRET=secretref:jobs-secret `
  ROOM_MAILBOXES='{"room-jobmonroe":"meetingroom.stamford@sodali.com"}'
```

## 5. Easy Auth — allow login-free + cron paths (Phase C)
```powershell
az containerapp auth update -g $RG -n $APP --excluded-paths "/api/checkin,/api/checkout,/api/jobs"
```
(Email check-in/out links and the cron jobs must bypass the Entra gate; jobs are still protected by `JOBS_SECRET`.)

## 6. Roles via Entra groups (Phase D)
- Create/confirm 3 security groups: **Global Admin**, **Site Admin(s)**, **Staff**.
- In the app reg → **Token configuration → Add groups claim** (Security groups) so `groups` lands in the token.
- Set env:
```powershell
az containerapp update -g $RG -n $APP --set-env-vars `
  GLOBAL_ADMIN_GROUP_ID="<global-admin-group-objectId>" `
  SITE_ADMIN_GROUP_IDS="<site-admin-group-id-1>,<site-admin-group-id-2>" DEV_ROLE=""
```

## 7. Scheduled jobs (cron) — Phase C  (timezone-aware, one job)
Each office fires at its **own local** 08:00 / 09:30 / 17:00 / 17:30 / 18:00. The app does this:
a single `tick` runs **every 30 min (UTC)** and, per office, computes local time and runs whatever is due (offices' timezones are set in `lib/data.ts`). So you only create **one** job:
```powershell
$URL="https://workspace.sodali.com"          # or the azurecontainerapps.io fqdn
$JOBSECRET="<same JOBS_SECRET you set above>"
az containerapp job create -g $RG -n caj-tick --environment $CAE `
  --trigger-type Schedule --cron-expression "*/30 * * * *" --replica-timeout 300 `
  --image mcr.microsoft.com/azure-cli --cpu 0.25 --memory 0.5Gi `
  --command "/bin/sh" "-c" "curl -s -H 'x-jobs-secret: $JOBSECRET' $URL/api/jobs/tick"
```
(Individual tasks like `/api/jobs/checkin` can be curled manually for testing — they run for all offices using each office's local date.) Note: only whole/half-hour timezone offices are exact on a 30-min cron; if you add a 45-min-offset office, run `*/15`.

## 8. Custom domain `workspace.sodali.com` + free TLS
```powershell
az containerapp show -g $RG -n $APP --query "{fqdn:properties.configuration.ingress.fqdn, verifyId:properties.customDomainVerificationId}" -o table
# DNS on sodali.com:  CNAME workspace -> <fqdn>   ;   TXT asuid.workspace -> <verifyId>
az containerapp hostname add  -g $RG -n $APP --hostname workspace.sodali.com
az containerapp hostname bind -g $RG -n $APP --hostname workspace.sodali.com --environment $CAE --validation-method CNAME
```

---
### Notes / limitations
- **Scoped mail**: restrict Graph `Mail.Send` to the sodali.workspace mailbox via Exchange Online: `New-ApplicationAccessPolicy -AppId <APPID> -PolicyScopeGroupId <mail-enabled-sec-group-with-sodali.workspace> -AccessRight RestrictAccess`.
- **Timezones**: cron + GRAPH_TIMEZONE are single-region (East US). Multi-office local-time scheduling is a follow-up.
- **Room mailboxes**: populate `ROOM_MAILBOXES` (spaceKey → mailbox) per building; double-booking is prevented by the room mailbox + the app's conflict check.
- **Audit log** is written to the `AuditLog` table (bookings, locks, check-ins, auto jobs). A read UI is a small follow-up.

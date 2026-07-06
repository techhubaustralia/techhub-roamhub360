# Deployment runbook — Workspace Hub

How to ship a change to the production Azure Container App. Based on the actual
process used (build image in ACR → point the Container App at the new tag).

> No secrets appear in this file. Values for secrets live only as Container App
> secrets / env vars — never paste them into commands, chat, or commits.

## 1. Infrastructure

| Thing | Value |
|-------|-------|
| Git remote (`origin`) | `https://dev.azure.com/MSplatform0482/WorkSpace-Hub/_git/WorkSpace-Hub` |
| Branch | `main` |
| Local checkout | `C:\Projects\workspace-hub` |
| Subscription | `c63bfac0-ed5f-4b88-bff3-d1a8d3aa88fe` |
| Resource group | `RG-WorkSpace_Hub-Prod-Eastus` |
| Container Registry (ACR) | `crworkspacehubprodeastus` (`crworkspacehubprodeastus.azurecr.io`) |
| Container App | `ca-workspacehub-prod-eastus` |
| Image repo | `crworkspacehubprodeastus.azurecr.io/workspace-hub` |
| Public URL | https://ca-workspacehub-prod-eastus.nicedune-abe1ed31.eastus.azurecontainerapps.io |
| Ingress | external, target port **3000** |
| Revisions mode | **Single** (100% traffic always goes to the latest revision) |

Because the app runs in **Single** revision mode, updating the image is a full
cut-over: the new revision takes 100% of traffic once healthy, and rollback is
just pointing the image back at the previous tag.

## 2. Version tags

Images are tagged `vN` (incrementing): `…/workspace-hub:v72` is current.
Pick the next number for each deploy. Check what is live:

```bash
az rest --method get \
  --url "https://management.azure.com/subscriptions/c63bfac0-ed5f-4b88-bff3-d1a8d3aa88fe/resourceGroups/RG-WorkSpace_Hub-Prod-Eastus/providers/Microsoft.App/containerApps/ca-workspacehub-prod-eastus?api-version=2024-03-01" \
  --query "properties.template.containers[0].image" -o tsv
```

## 3. Standard deploy

```bash
cd C:\Projects\workspace-hub

# a) push source
git push origin main

# b) build + push the image in ACR (server-side build; no local Docker needed)
az acr build -r crworkspacehubprodeastus -t workspace-hub:v72 --no-logs .

# c) point the Container App at the new tag
az containerapp update \
  -n ca-workspacehub-prod-eastus \
  -g RG-WorkSpace_Hub-Prod-Eastus \
  --image crworkspacehubprodeastus.azurecr.io/workspace-hub:v72
```

## 4. Fallback deploy — when `az containerapp` is broken

If `az containerapp …` fails to even start with a `PermissionError` /
`Access is denied` on `~/.azure/cliextensions/containerapp/*.dist-info`, the
CLI extension is corrupted or quarantined (an endpoint-security agent has been
seen locking the beta build). **Do not try to bypass it with elevation.** The
build step (3b) still works. Do the image swap through the ARM REST API with
`az rest` (a core command that does not need the extension):

```powershell
$sub = "c63bfac0-ed5f-4b88-bff3-d1a8d3aa88fe"
$rid = "/subscriptions/$sub/resourceGroups/RG-WorkSpace_Hub-Prod-Eastus/providers/Microsoft.App/containerApps/ca-workspacehub-prod-eastus"

# GET current resource
az rest --method get --url "https://management.azure.com$rid`?api-version=2024-03-01" -o json > "$env:TEMP\ca.json"

# change the image, PATCH the template back (template-only PATCH preserves all other config)
$j = Get-Content "$env:TEMP\ca.json" -Raw | ConvertFrom-Json
foreach ($c in $j.properties.template.containers) { $c.image = "crworkspacehubprodeastus.azurecr.io/workspace-hub:v72" }
$body = @{ properties = @{ template = $j.properties.template } } | ConvertTo-Json -Depth 40
Set-Content "$env:TEMP\ca-patch.json" $body -Encoding utf8
az rest --method patch --url "https://management.azure.com$rid`?api-version=2024-03-01" --headers "Content-Type=application/json" --body "@$env:TEMP\ca-patch.json"
```

To repair the extension itself (needs a session with rights to the file, e.g.
after IT clears the quarantine): remove `~/.azure/cliextensions/containerapp`
then `az extension add --name containerapp`.

## 5. Verify

```powershell
$sub = "c63bfac0-ed5f-4b88-bff3-d1a8d3aa88fe"
$rid = "/subscriptions/$sub/resourceGroups/RG-WorkSpace_Hub-Prod-Eastus/providers/Microsoft.App/containerApps/ca-workspacehub-prod-eastus"
# provisioning state + running image
az rest --method get --url "https://management.azure.com$rid`?api-version=2024-03-01" `
  --query "{state:properties.provisioningState, image:properties.template.containers[0].image}" -o json
# latest revision must be active + Healthy + Running
az rest --method get --url "https://management.azure.com$rid/revisions?api-version=2024-03-01" `
  --query "value[-1].{name:name, active:properties.active, health:properties.healthState, running:properties.runningState}" -o json
# app answers
Invoke-WebRequest "https://ca-workspacehub-prod-eastus.nicedune-abe1ed31.eastus.azurecontainerapps.io/" -UseBasicParsing | Select-Object StatusCode
```

Expect `provisioningState = Succeeded`, latest revision `active/Healthy/Running`
on the new tag, and HTTP `200`.

## 6. Rollback

Re-run the deploy (standard or fallback) with the **previous** tag, e.g. `v71`.
Single-revision mode cuts traffic straight back once the old image is healthy.

## 7. Environment variables

Set on the Container App (names only — values are Container App secrets):

`AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`, `DATABASE_URL`,
`BOOTSTRAP_ADMINS`, `AZURE_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`,
`MAIL_FROM`, `GRAPH_TIMEZONE`.

- **`CHECKIN_SECRET` is NOT currently set.** Check-in tokens are HMAC-signed;
  without an explicit secret the signing key is not stable/strong. Set it in
  prod (as a Container App secret) so check-in links can't be forged.
- Schema changes: run `prisma db push` against the prod DB only when the Prisma
  schema changes. The parking work needed no migration (`kind` is a string).

# Deploy — Workspace Hub (Azure)

Architecture: **Azure Container Apps** (host) · **Azure Blob Storage** (floor-plan JSON + images) · **Azure SQL Serverless** (bookings/locks/buildings) · **Azure Container Registry** (image) · **Azure DevOps Pipelines** (CI/CD). Sized for ~50 concurrent / ~500 users; serverless SQL + consumption Container Apps keep idle cost low (~$30–50/mo).

## 1. One-time provisioning (az CLI)

```bash
RG=workspace-hub-rg
LOC=eastus
ACR=workspacehubacr            # globally unique
STG=workspacehubstore$RANDOM   # globally unique, lowercase
SQLSRV=workspace-hub-sql$RANDOM
SQLDB=workspacehub
APPENV=workspace-hub-env
APP=workspace-hub

az group create -n $RG -l $LOC

# Container registry
az acr create -g $RG -n $ACR --sku Basic --admin-enabled true

# Blob storage + container
az storage account create -g $RG -n $STG --sku Standard_LRS --kind StorageV2 --access-tier Hot
STG_CONN=$(az storage account show-connection-string -g $RG -n $STG -o tsv)
az storage container create --name plans --connection-string "$STG_CONN"

# Azure SQL — serverless, auto-pause
az sql server create -g $RG -n $SQLSRV -l $LOC -u shadmin -p '<STRONG-PASSWORD>'
az sql db create -g $RG -s $SQLSRV -n $SQLDB \
  --edition GeneralPurpose --compute-model Serverless \
  --family Gen5 --capacity 2 --auto-pause-delay 60 --min-capacity 0.5
az sql server firewall-rule create -g $RG -s $SQLSRV -n allow-azure \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0   # allow Azure services

# Container Apps environment + app (first deploy uses a placeholder image)
az extension add --name containerapp --upgrade
az containerapp env create -g $RG -n $APPENV -l $LOC
az containerapp create -g $RG -n $APP --environment $APPENV \
  --image mcr.microsoft.com/k8se/quickstart:latest \
  --target-port 3000 --ingress external \
  --min-replicas 1 --max-replicas 10 \
  --cpu 0.5 --memory 1.0Gi
```

## 2. App settings (secrets)

```bash
DATABASE_URL="sqlserver://$SQLSRV.database.windows.net:1433;database=$SQLDB;user=shadmin;password=<STRONG-PASSWORD>;encrypt=true;trustServerCertificate=false"

az containerapp update -g $RG -n $APP --set-env-vars \
  AZURE_STORAGE_CONNECTION_STRING="$STG_CONN" \
  AZURE_STORAGE_CONTAINER=plans \
  DATABASE_URL="$DATABASE_URL"
```

Autoscale on HTTP load (cost-effective):

```bash
az containerapp update -g $RG -n $APP \
  --scale-rule-name http --scale-rule-type http \
  --scale-rule-http-concurrency 50
```

## 3. Azure DevOps CI/CD

1. Push repo to Azure Repos (or connect GitHub).
2. Service connections: **Docker Registry** → ACR (`workspace-hub-acr`); **Azure Resource Manager** → subscription (`workspace-hub-azure`).
3. New pipeline → use existing `azure-pipelines.yml`. Update the `variables:` block with your `acrName` / `resourceGroup` / `containerApp` names.
4. Run. It builds the image, pushes to ACR, and `az containerapp update`s the app to the new tag.

## 4. Database migrations (when SQL data layer is wired)

```bash
npx prisma migrate deploy   # applies prisma/schema.prisma to Azure SQL
```

## Local dev (no Azure)

Leave `AZURE_STORAGE_CONNECTION_STRING` and `DATABASE_URL` unset → plans persist to `./data/*.json`. `npm run dev`.

## Status / next

- ✅ Plans + custom buildings → Blob (env-gated, file fallback)
- ✅ Container build (`output: standalone`), pipeline, provisioning
- ⏳ Wire bookings + admin locks to Azure SQL via Prisma (`prisma/schema.prisma` ready)
- ⏳ Entra ID SSO (Container Apps auth or NextAuth)

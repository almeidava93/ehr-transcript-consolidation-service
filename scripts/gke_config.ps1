# Authenticate with Google Cloud
gcloud auth application-default login

# Set the project
gcloud config set project "ehr-transcript-consolidation"

# Update application default credentials quota project
gcloud config set project "ehr-transcript-consolidation"

# Create cluster
gcloud beta container `
    --project "ehr-transcript-consolidation" `
    clusters create-auto "autopilot-cluster-1" `
    --region "southamerica-east1" `
    --release-channel "regular" `
    --enable-dns-access `
    --enable-ip-access `
    --no-enable-google-cloud-access `
    --network "projects/ehr-transcript-consolidation/global/networks/default" `
    --enable-auto-ipam `
    --subnetwork "projects/ehr-transcript-consolidation/regions/southamerica-east1/subnetworks/gke-autopilot-cluster-1-subnet-e12472fe" `
    --binauthz-evaluation-mode=DISABLED `
    --scopes=https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/trace.append

# Install kubectl
gcloud components install kubectl

# Check installed kubectl version
kubectl version --client

# Check if GKE plugin is installed 
gke-gcloud-auth-plugin --version

# If not, install the GKE plugin
gcloud components install gke-gcloud-auth-plugin

# Update kubeconfig to use the new cluster
gcloud container clusters get-credentials "autopilot-cluster-1" --location="southamerica-east1"

# List namespaces
kubectl get namespaces

# List current config
kubectl get namespaces

# Show current context
kubectl config current-context # should be "gke_ehr-transcript-consolidation_southamerica-east1_autopilot-cluster-1"

# Show cluster info
kubectl cluster-info

# DASHBOARD
# Apply
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.6.1/aio/deploy/recommended.yaml

# Start local proxy
kubectl -n kubernetes-dashboard port-forward svc/kubernetes-dashboard 8443:443

# Open the following URL in your browser to access the Kubernetes Dashboard:
https://localhost:8443/

# Create admin service account
kubectl create serviceaccount admin-user -n kubernetes-dashboard

# Grant admin permissions to the admin-user service account
kubectl create clusterrolebinding admin-user-binding `
  --clusterrole=cluster-admin `
  --serviceaccount=kubernetes-dashboard:admin-user

# Create an ephemeral token for temporary secure access
# Token valid for 24 hours
# Use it to login to the dashboard
kubectl -n kubernetes-dashboard create token admin-user --duration=24h


## ARTIFACT REGISTRY
# Enable the Artifact Registry API
gcloud services enable artifactregistry.googleapis.com

# Create a Docker repository
gcloud artifacts repositories create "ehr-transcript-consolidation-docker-repo" `
    --repository-format=docker `
    --location=southamerica-east1 `
    --description="Docker repository for EHR Transcript Consolidation project"

# Authenticate Docker to the Artifact Registry
gcloud auth configure-docker southamerica-east1-docker.pkg.dev

# Build local images of interest
docker compose -f compose.yaml build

# Tag the local images with the Artifact Registry repository name. Must follow the pattern:
# LOCATION-docker.pkg.dev/PROJECT-ID/REPOSITORY/IMAGE:TAG
docker tag api southamerica-east1-docker.pkg.dev/ehr-transcript-consolidation/ehr-transcript-consolidation-docker-repo/api:latest

docker tag frontend southamerica-east1-docker.pkg.dev/ehr-transcript-consolidation/ehr-transcript-consolidation-docker-repo/frontend:latest

# Push the images to the Artifact Registry
docker push southamerica-east1-docker.pkg.dev/ehr-transcript-consolidation/ehr-transcript-consolidation-docker-repo/api:latest

docker push southamerica-east1-docker.pkg.dev/ehr-transcript-consolidation/ehr-transcript-consolidation-docker-repo/frontend:latest

# Make sure the reference to the images in the Kubernetes deployment manifests matches the Artifact Registry repository name and image tags with the same pattern as above.
southamerica-east1-docker.pkg.dev/ehr-transcript-consolidation/ehr-transcript-consolidation-docker-repo/api:latest

southamerica-east1-docker.pkg.dev/ehr-transcript-consolidation/ehr-transcript-consolidation-docker-repo/frontend:latest

# Deploy to GKE
# Create the namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl apply -R -f k8s/secrets/_api-secret.yaml
kubectl apply -R -f k8s/secrets/_mysql-secret.yaml

# Create other resources (deployments, services, etc.) from the k8s directory
kubectl apply -R -f k8s/mysql/
kubectl apply -R -f k8s/redis/
kubectl apply -R -f k8s/api/
kubectl apply -R -f k8s/frontend/


# NETWORKING
# Create a stable IP address for the frontend service
gcloud compute addresses create frontend-ip --region southamerica-east1

# Inspect the IP address
gcloud compute addresses describe frontend-ip `
   --region=southamerica-east1 `
   --format="value(address)"

# Use the IP address to create a DNS A record in your domain's DNS settings, pointing to the frontend service.


# Setup Google Cloud OpenID Connect (OIDC) for CI/CD witth GitHub Actions
# Create service account for GitHub Actions
gcloud iam service-accounts create github-deployer

# Grant the service account the necessary roles for deploying to GKE
gcloud projects add-iam-policy-binding ehr-transcript-consolidation `
    --member="serviceAccount:github-deployer@ehr-transcript-consolidation.iam.gserviceaccount.com" `
    --role="roles/container.developer"

gcloud projects add-iam-policy-binding ehr-transcript-consolidation `
    --member="serviceAccount:github-deployer@ehr-transcript-consolidation.iam.gserviceaccount.com" `
    --role="roles/artifactregistry.writer"

# Create a workload identity pool for GitHub Actions
gcloud iam workload-identity-pools create github-pool --location global

# Create the workload identity provider for GitHub Actions
gcloud iam workload-identity-pools providers create-oidc github-provider `
    --location=global `
    --workload-identity-pool=github-pool `
    --issuer-uri="https://token.actions.githubusercontent.com" `
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" `
    --attribute-condition="attribute.repository=='almeidava93/ehr-transcript-consolidation-service' && attribute.ref=='refs/heads/production'"

# Grant the service account access to the workload identity pool
# Define variables
$PROJECT_ID="ehr-transcript-consolidation"
$PROJECT_NUMBER="440326212883" # Can be obtained with `gcloud projects describe $PROJECT_ID --format="value(projectNumber)"`
$SERVICE_ACCOUNT="github-deployer"
$REPO="almeidava93/ehr-transcript-consolidation-service"

gcloud iam service-accounts add-iam-policy-binding `
    github-deployer@$PROJECT_ID.iam.gserviceaccount.com `
    --role="roles/iam.workloadIdentityUser" `
    --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$REPO"
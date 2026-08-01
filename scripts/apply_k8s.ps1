# Build images for the API and frontend services, and load them into Minikube
docker build -t api:latest ./services/api
docker build --target production -t frontend:latest ./services/frontend
minikube image load api:latest frontend:latest

# Create the namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets from .env files and apply them to the Kubernetes cluster
kubectl create secret generic api-secrets `
    --namespace ehr-transcript-consolidation-service `
    --from-env-file=services\api\.env `
    --dry-run=client `
    --output=yaml | kubectl apply -f -

# Create other resources (deployments, services, etc.) from the k8s directory
kubectl apply -R -f k8s/
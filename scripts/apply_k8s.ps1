# Build images for the API, frontend and other services, and load them into Minikube
minikube image build -t api:latest ./services/api
minikube image build --target production -t frontend:latest ./services/frontend

# Create the namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl apply -R -f k8s/secrets/_*.yaml

# Create other resources (deployments, services, etc.) from the k8s directory
kubectl apply -R -f k8s/mysql/
kubectl apply -R -f k8s/redis/
kubectl apply -R -f k8s/api/
kubectl apply -R -f k8s/frontend/
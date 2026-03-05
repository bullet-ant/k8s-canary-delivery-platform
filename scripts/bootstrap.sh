#!/usr/bin/env bash
# Bootstrap: create kind cluster + install platform components.
# Prerequisites: Docker, kind, kubectl, helm.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="${REPO_ROOT}/kind-config.yaml"
CLUSTER_NAME="canary-demo"
CONTEXT="kind-${CLUSTER_NAME}"

# ── Colors ────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }

# ── 1. Kind cluster ──────────────────────────────────────────────
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  info "Cluster '${CLUSTER_NAME}' already exists, skipping creation."
else
  info "Creating kind cluster '${CLUSTER_NAME}'..."
  kind create cluster --config "$CONFIG"
fi

kubectl wait --for=condition=Ready nodes --all --timeout=120s --context "$CONTEXT"
info "Cluster nodes are Ready."

# ── 2. Nginx Ingress Controller ──────────────────────────────────
info "Installing Nginx Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/kind/deploy.yaml --context "$CONTEXT"
info "Waiting for Ingress controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s --context "$CONTEXT"

# ── 3. ArgoCD ────────────────────────────────────────────────────
info "Installing ArgoCD..."
kubectl create namespace argocd --context "$CONTEXT" --dry-run=client -o yaml | kubectl apply -f - --context "$CONTEXT"
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml --context "$CONTEXT" --server-side --force-conflicts
info "Waiting for ArgoCD server to be ready..."
kubectl wait --namespace argocd \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/name=argocd-server \
  --timeout=180s --context "$CONTEXT"

# ── 4. Argo Rollouts ─────────────────────────────────────────────
info "Installing Argo Rollouts..."
kubectl create namespace argo-rollouts --context "$CONTEXT" --dry-run=client -o yaml | kubectl apply -f - --context "$CONTEXT"
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml --context "$CONTEXT"
info "Waiting for Argo Rollouts controller..."
kubectl wait --namespace argo-rollouts \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/name=argo-rollouts \
  --timeout=120s --context "$CONTEXT"

# ── 5. Prometheus (via Helm) ─────────────────────────────────────
info "Installing Prometheus..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
helm repo update
kubectl create namespace monitoring --context "$CONTEXT" --dry-run=client -o yaml | kubectl apply -f - --context "$CONTEXT"
helm upgrade --install prometheus prometheus-community/prometheus \
  --namespace monitoring \
  --set server.service.type=ClusterIP \
  --set alertmanager.enabled=false \
  --set kube-state-metrics.enabled=false \
  --set prometheus-node-exporter.enabled=false \
  --set prometheus-pushgateway.enabled=false \
  --kube-context "$CONTEXT" \
  --wait --timeout 120s

# ── Done ──────────────────────────────────────────────────────────
info "Bootstrap complete!"
echo ""
echo "  Cluster:         kubectl cluster-info --context ${CONTEXT}"
echo "  ArgoCD password: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' --context ${CONTEXT} | base64 -d"
echo "  ArgoCD UI:       kubectl port-forward svc/argocd-server -n argocd 8080:443 --context ${CONTEXT}"
echo "  Rollouts UI:     kubectl argo rollouts dashboard --context ${CONTEXT}"
echo "  Prometheus:      kubectl port-forward svc/prometheus-server -n monitoring 9090:80 --context ${CONTEXT}"
echo ""

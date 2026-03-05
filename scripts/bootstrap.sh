#!/usr/bin/env bash
# Creates the multi-node kind cluster from kind-config.yaml.
# Prerequisites: Docker, kind, kubectl.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="${REPO_ROOT}/kind-config.yaml"
CLUSTER_NAME="llm-k8s"

if [[ ! -f "$CONFIG" ]]; then
  echo "Config not found: $CONFIG"
  exit 1
fi

echo "Creating kind cluster '$CLUSTER_NAME' from $CONFIG ..."
kind create cluster --config "$CONFIG" --name "$CLUSTER_NAME"

echo "Waiting for nodes to be Ready ..."
kubectl wait --for=condition=Ready nodes --all --timeout=120s --context "kind-$CLUSTER_NAME"

echo "Cluster is up. Use: kubectl cluster-info --context kind-$CLUSTER_NAME"

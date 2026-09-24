FROM n8nio/n8n:latest

USER root

# O pacote já contém o dist compilado e pode ser instalado sem devDependencies.
COPY packages/n8n-nodes-forte-panel /tmp/n8n-nodes-forte-panel
RUN mkdir -p /opt/n8n-custom-nodes \
  && cd /tmp/n8n-nodes-forte-panel \
  && npm pack --pack-destination /tmp \
  && npm install --omit=dev --prefix /opt/n8n-custom-nodes /tmp/n8n-nodes-forte-panel-0.1.0.tgz \
  && rm -rf /tmp/n8n-nodes-forte-panel /tmp/n8n-nodes-forte-panel-0.1.0.tgz \
  && chown -R node:node /opt/n8n-custom-nodes

USER node

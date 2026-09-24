# Dockerfile for openapidoc
FROM node:24-alpine

LABEL org.label-schema.name="openapidoc" \
    org.label-schema.description="openapidoc Docker image" \
    org.label-schema.url="https://github.com/nickheyer/openapidoc" \
    org.label-schema.vcs-url="https://github.com/nickheyer/openapidoc" \
    org.label-schema.schema-version="1.0" \
    org.label-schema.docker.cmd="docker run --rm -v $(pwd):/home/node/apidoc openapidoc -o outputdir -i inputdir"

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

ENV PATH=$PATH:$NPM_CONFIG_PREFIX/bin

USER node

RUN mkdir -p /home/node/apidoc

WORKDIR /home/node/apidoc

RUN npm install --omit=dev -g openapidoc

ENTRYPOINT ["apidoc"]

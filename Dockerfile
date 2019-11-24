FROM node:13-stretch

USER node
COPY --chown=node:node . /app
WORKDIR /app

ENV GOOGLE_APPLICATION_CREDENTIALS ./key/GCP_key.json
ENV PORT 1337
ENV LOG_LEVEL debug

RUN yarn install
EXPOSE 1337

ENTRYPOINT ["./docker-entrypoint.sh"]

CMD ["node", "app.js"]
FROM node:13-slim

RUN apt-get update && \
    apt-get install -y build-essential

WORKDIR /repo

ADD package.json yarn.lock /repo/
RUN yarn install --production=true --pure-lockfile

ADD . /repo
VOLUME /ipfs/repo
ENV IPFS_REPO_FALLBACK "/ipfs/repo"

CMD ["yarn", "--silent", "start"]
FROM node:10-slim

RUN apt-get update && \
    apt-get install -y openssh-client build-essential git python

WORKDIR /repo

ADD package.json yarn.lock /repo/
RUN yarn install --production=true --pure-lockfile

ADD . /repo
VOLUME /ipfs/repo
ENV IPFS_REPO_FALLBACK "/ipfs/repo"

CMD ["yarn", "--silent", "start"]
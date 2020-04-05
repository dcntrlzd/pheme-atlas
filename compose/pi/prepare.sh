#!/bin/bash

if ! [ -x "$(command -v docker)" ]; then
  curl -sSL https://get.docker.com | sh
  usermod -aG docker pi
  docker info -f "{{.Name}}"
fi

if ! [ -x "$(command -v pip3)" ]; then
  apt-get install -y python3 python3-pip
  pip3 install docker-compose
fi

mkdir -p /var/ipfs
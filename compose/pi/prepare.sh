curl -sSL https://get.docker.com | sh
usermod -aG docker pi
docker info -f "{{.Name}}"
apt-get install -y python3 python3-pip
pip3 install docker-compose
mkdir /var/ipfs
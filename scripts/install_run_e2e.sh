#!/bin/bash -e
BACKEND_DIR=server
VENV=`pwd`/$BACKEND_DIR/env/bin/activate
PLANNING_DIR=`pwd`
E2E_DIR=`pwd`/e2e
mkdir $E2E_DIR && cd $E2E_DIR

git init
git remote add origin https://github.com/superdesk/superdesk.git
git fetch origin planning-mvp
git checkout planning-mvp

git clone https://github.com/superdesk/superdesk-core.git server-core
git clone https://github.com/superdesk/superdesk-client-core.git client-core

# Update superdesk-core references to local repo
sed -i 's/.*superdesk-core.git.*/-e ..\/server-core/' server/requirements.txt
sed -i -re 's/("superdesk-core":)[^,]*(,?)/\1 "file:..\/client-core"\2/' client/package.json

# Update superdesk-planning references to local repo
sed -i 's/.*superdesk-planning.git.*/-e ..\/..\//' server/requirements.txt
sed -i -re 's/("superdesk-planning":)[^.]*(,?)/\1 "file:..\/..\/"\2/' client/package.json

cat server/requirements.txt
cat client/package.json

# Update superdesk-client-core and superdesk-core references ton local repos
cd $PLANNING_DIR
sed -i sed -i -re 's/("superdesk-core":)[^,]*(,?)/\1 "file:e2e\/client-core"\2/' package.json
sed -i 's/.*superdesk-core.git.*/-e e2e\/server-core/' server/requirements.txt
cat server/requirements.txt
cat package.json

# Manually install all repo node modules
#cd client-core && npm install --python=python2.7 && cd ..
#cd ../ && npm install --python=python2.7 && cd ..

cd $E2E_DIR

npm install -g --python=python2.7 grunt-cli
export DISPLAY=:99.0 && /sbin/start-stop-daemon --start --quiet --pidfile /tmp/custom_xvfb_99.pid --make-pidfile --background --exec /usr/bin/Xvfb -- :99 -ac -screen 0 1920x1080x24
export CHROME_BIN=`which google-chrome` && $CHROME_BIN --version ;
cd server && pip install -U -r dev-requirements.txt && cd ..
cd client && npm install --python=python2.7 && grunt build && cd ..
pwd
ls -la
ls -la $E2E_DIR
ls -la $PLANNING_DIR
sudo sed -i 's\enabled: true\enabled: false\' /etc/mongod.conf
sudo service mongod restart
#mkdir /tmp/es-backups
#sudo chown elasticsearch:elasticsearch /tmp/es-backups
#echo "path.repo: ['/tmp/es-backups']" | sudo tee -a /etc/elasticsearch/elasticsearch.yml
#echo "index.store.type: memory" | sudo tee -a /etc/elasticsearch/elasticsearch.yml
sudo service elasticsearch restart
sleep 60
#curl -XPUT 'http://localhost:9200/_snapshot/backups' -d '{"type": "fs", "settings": {"location": "/tmp/es-backups"}}'
cd $E2E_DIR/client/dist
nohup python -m http.server 9000 &
cd $E2E_DIR/server
echo "SUPERDESK_TESTING = True" | sudo tee -a ./settings.py
echo "DEBUG = True" | sudo tee -a ./settings.py
# echo "MONGO_DBNAME = 'superdesk_e2e'" | sudo tee -a ./settings.py
# echo "MONGO_URI = 'mongodb://localhost/%s' % MONGO_DBNAME" | sudo tee -a ./settings.py
# echo "ELASTICSEARCH_INDEX = MONGO_DBNAME" | sudo tee -a ./settings.py
# echo "REDIS_URL='redis://localhost:6379/2'" | sudo tee -a ./settings.py
# echo "WEB_CONCURRENCY=3" | sudo tee -a ./settings.py
# echo "WEB_TIMEOUT=5" | sudo tee -a ./settings.py
# cd $PLANNING_DIR
# cd ./node_modules/superdesk-core/test-server/
honcho start &
sleep 60
cd $PLANNING_DIR
./node_modules/.bin/webdriver-manager update --gecko=false
./node_modules/protractor/bin/protractor protractor.conf.js --stackTrace --verbose

#!/bin/zsh

# ==============================
# CONFIG
# ==============================
PROJECT_ID="sdsanalyticsservice"
REGION="europe-west1"
REPO="data-service-repo"
SERVICE="data-service"
VERSION_FILE="./.version"
LOGFILE="./deploy.log"

echo "==== DEPLOY INIZIATO ====" > $LOGFILE
echo "Data: $(date)" >> $LOGFILE

# ==============================
# VERSIONAMENTO SEMVER
# ==============================
if [ ! -f "$VERSION_FILE" ]; then
  echo "1.0.0" > $VERSION_FILE
fi

VERSION=$(cat $VERSION_FILE)
IFS='.' read MAJOR MINOR PATCH <<< "$VERSION"

# Controllo commit per semver
COMMITS=$(git log -n 20 --pretty=format:"%s")

if echo "$COMMITS" | grep -qi "BREAKING:" ; then
  MAJOR=$((MAJOR + 1))
  MINOR=0
  PATCH=0
elif echo "$COMMITS" | grep -qi "feat:" ; then
  MINOR=$((MINOR + 1))
  PATCH=0
else
  PATCH=$((PATCH + 1))
fi

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo $NEW_VERSION > $VERSION_FILE
TAG="v$NEW_VERSION"

echo "Nuova versione: $TAG" | tee -a $LOGFILE

IMAGE="europe-west1-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:$TAG"

# ==============================
# BUILD DOCKER (aggiornato)
# ==============================
# Lettura della DATABASE_URL dal file .env
DATABASE_URL_VALUE=$(grep "^DATABASE_URL=" .env | cut -d '=' -f2-)

echo "Build Docker..." | tee -a $LOGFILE
docker build --platform linux/amd64 \
  --build-arg DATABASE_URL="$DATABASE_URL_VALUE" \
  -t $IMAGE . >> $LOGFILE 2>&1

if [ $? -ne 0 ]; then
  MSG="ERRORE: build Docker fallita per $SERVICE ($TAG)"
  echo $MSG | tee -a $LOGFILE
  curl -s -X POST https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage \
    -d chat_id=$TELEGRAM_CHAT_ID -d text="$MSG"
  exit 1
fi

# ==============================
# PUSH SU ARTIFACT REGISTRY
# ==============================
echo "Push immagine..." | tee -a $LOGFILE
docker push $IMAGE >> $LOGFILE 2>&1

if [ $? -ne 0 ]; then
  MSG="ERRORE: push fallito per $SERVICE ($TAG)"
  echo $MSG | tee -a $LOGFILE
  curl -s -X POST https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage \
    -d chat_id=$TELEGRAM_CHAT_ID -d text="$MSG"
  exit 1
fi

# ==============================
# SALVO REVISION ATTUALE
# ==============================
OLD_REVISION=$(gcloud run services describe $SERVICE \
  --region $REGION --format='value(status.latestReadyRevisionName)')

echo "Old revision: $OLD_REVISION" >> $LOGFILE

# ==============================
# DEPLOY SU CLOUD RUN
# ==============================
echo "Deploy Cloud Run..." | tee -a $LOGFILE

gcloud run deploy $SERVICE \
  --image $IMAGE \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 >> $LOGFILE 2>&1

if [ $? -ne 0 ]; then
  MSG="ERRORE: deploy fallito per $SERVICE ($TAG). Rollback in corso..."
  echo $MSG | tee -a $LOGFILE
  
  curl -s -X POST https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage \
    -d chat_id=$TELEGRAM_CHAT_ID -d text="$MSG"

  gcloud run services update-traffic $SERVICE \
    --to-revisions=$OLD_REVISION=100 --region $REGION

  exit 1
fi

URL=$(gcloud run services describe $SERVICE --region $REGION --format='value(status.url)')

# ==============================
# HEALTH CHECK
# ==============================
sleep 3
curl -f "$URL/api/health" > /dev/null
if [ $? -ne 0 ]; then
  MSG="ERRORE: Health check fallito. Rollback eseguito su $OLD_REVISION."
  echo $MSG | tee -a $LOGFILE
  
  curl -s -X POST https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage \
    -d chat_id=$TELEGRAM_CHAT_ID -d text="$MSG"

  gcloud run services update-traffic $SERVICE \
    --to-revisions=$OLD_REVISION=100 --region $REGION

  exit 1
fi

# ==============================
# SUCCESSO
# ==============================
MSG="Deploy completato: $SERVICE ($TAG)"
echo $MSG | tee -a $LOGFILE

curl -s -X POST https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage \
  -d chat_id=$TELEGRAM_CHAT_ID -d text="$MSG"

# INVIO LOG DEL DEPLOY A TELEGRAM
curl -s -F document=@$LOGFILE \
  https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendDocument \
  -F chat_id=$TELEGRAM_CHAT_ID \
  -F caption="Log deploy $TAG"

# ==============================
# GIT TAG AUTOMATICI
# ==============================
git add .version
git commit -m "deploy: version $TAG" >> /dev/null 2>&1
git tag $TAG
git push --tags >> /dev/null 2>&1

echo "Fine deploy $TAG" | tee -a $LOGFILE

#!/bin/zsh

########################################
# CONFIG
########################################
PROJECT_ID="sdsanalyticsservice"
REGION="europe-west1"
REPO="data-service-repo"
SERVICE="data-service"
VERSION_FILE="./.version"
LOGFILE="./deploy.log"

DETAILS_URL_DEFAULT="https://console.cloud.google.com/run/detail/$REGION/$SERVICE?project=$PROJECT_ID"
DETAILS_URL="${DEPLOY_DETAILS_URL:-$DETAILS_URL_DEFAULT}"

# Carico variabili dal file .env
DATABASE_URL_VALUE=$(grep "^DATABASE_URL=" .env | cut -d '=' -f2-)
TELEGRAM_CHAT_ID=$(grep "^TELEGRAM_CHAT_ID=" .env | cut -d '=' -f2-)
TELEGRAM_BOT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" .env | cut -d '=' -f2-)

if [ -z "$DATABASE_URL_VALUE" ] || [ -z "$TELEGRAM_CHAT_ID" ] || [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "ERRORE: variabili .env mancanti." | tee $LOGFILE
  exit 1
fi

format_duration() {
  local total=$1
  local mins=$(( total / 60 ))
  local secs=$(( total % 60 ))

  if [ $mins -gt 0 ]; then
    printf "%dm%02ds" $mins $secs
  else
    printf "%ds" $secs
  fi
}

echo "==== DEPLOY INIZIATO ====" | tee $LOGFILE
echo "Data: $(date)" | tee -a $LOGFILE

START_TIME=$(date +%s)


########################################
# VERSIONING
########################################
if [ ! -f "$VERSION_FILE" ]; then
  echo "1.0.0" > $VERSION_FILE
fi

VERSION=$(cat $VERSION_FILE)
IFS='.' read MAJOR MINOR PATCH <<< "$VERSION"

COMMITS=$(git log -n 20 --pretty=format:"%s")
LATEST_COMMIT=$(git log -1 --pretty=format:"%s")
LATEST_COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
CURRENT_REF=$(git symbolic-ref HEAD 2>/dev/null || git rev-parse HEAD 2>/dev/null || echo "HEAD")

if [ -z "$LATEST_COMMIT" ]; then
  LATEST_COMMIT="commit sconosciuto"
fi

if echo "$COMMITS" | grep -qi "BREAKING:" ; then
  MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
elif echo "$COMMITS" | grep -qi "feat:" ; then
  MINOR=$((MINOR + 1)); PATCH=0
else
  PATCH=$((PATCH + 1))
fi

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo $NEW_VERSION > $VERSION_FILE
TAG="v$NEW_VERSION"

echo "Nuova versione: $TAG" | tee -a $LOGFILE

IMAGE="europe-west1-docker.pkg.dev/$PROJECT_ID/$REPO/$SERVICE:$TAG"


########################################
# CLOUD BUILD (build + push)
########################################
echo "Cloud Build: build & push immagine..." | tee -a $LOGFILE

gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_IMAGE=$IMAGE \
  . 2>&1 | tee -a $LOGFILE

CLOUD_BUILD_EXIT=${pipestatus[1]:-0}

if [ $CLOUD_BUILD_EXIT -ne 0 ]; then
  MSG="ERRORE: cloud build fallita"
  echo $MSG | tee -a $LOGFILE
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      --data-urlencode chat_id="$TELEGRAM_CHAT_ID" \
      --data-urlencode text="$MSG"
  exit 1
fi


########################################
# OLD REVISION
########################################
OLD_REVISION=$(gcloud run services describe $SERVICE \
  --region $REGION --format='value(status.latestReadyRevisionName)' 2>/dev/null)

echo "Old revision: $OLD_REVISION" | tee -a $LOGFILE


########################################
# DEPLOY CLOUD RUN
########################################
echo "Deploy Cloud Run..." | tee -a $LOGFILE

gcloud run deploy $SERVICE \
  --image $IMAGE \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 2>&1 | tee -a $LOGFILE

DEPLOY_EXIT=${pipestatus[1]:-0}

if [ $DEPLOY_EXIT -ne 0 ]; then
  MSG="ERRORE: deploy fallito. Rollback..."
  echo $MSG | tee -a $LOGFILE

  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      --data-urlencode chat_id="$TELEGRAM_CHAT_ID" \
      --data-urlencode text="$MSG"

  if [ -n "$OLD_REVISION" ]; then
    gcloud run services update-traffic $SERVICE \
      --to-revisions="$OLD_REVISION"=100 --region $REGION
  fi

  exit 1
fi

URL=$(gcloud run services describe $SERVICE --region $REGION --format='value(status.url)')


########################################
# HEALTH CHECK
########################################
echo "Health check..." | tee -a $LOGFILE

sleep 3
curl -f "$URL/api/health" 2>&1 | tee -a $LOGFILE

HC_EXIT=${pipestatus[1]:-0}

if [ $HC_EXIT -ne 0 ]; then
  MSG="ERRORE: health check fallito. Rollback..."
  echo $MSG | tee -a $LOGFILE

  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      --data-urlencode chat_id="$TELEGRAM_CHAT_ID" \
      --data-urlencode text="$MSG"

  if [ -n "$OLD_REVISION" ]; then
    gcloud run services update-traffic $SERVICE \
      --to-revisions="$OLD_REVISION"=100 --region $REGION
  fi

  exit 1
fi


########################################
# SUCCESS
########################################
END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))
DURATION=$(format_duration $ELAPSED)

SUCCESS_MSG=$(cat <<EOF
[SUCCESS] Deploy $SERVICE riuscito
Ref: $CURRENT_REF
Commit: $LATEST_COMMIT_HASH - $LATEST_COMMIT
Immagine: $IMAGE
Durata: $DURATION
Dettagli: $DETAILS_URL
EOF
)

echo "$SUCCESS_MSG" | tee -a $LOGFILE

curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    --data-urlencode chat_id="$TELEGRAM_CHAT_ID" \
    --data-urlencode text="$SUCCESS_MSG"

echo "Fine deploy $TAG" | tee -a $LOGFILE

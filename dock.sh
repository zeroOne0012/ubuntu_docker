#!/bin/bash

# 관리자 권한 확인
if [ "$EUID" -ne 0 ]; then
    echo "이 스크립트는 관리자 권한이 필요합니다. sudo로 실행하세요."
    exit 1
fi

# 첫 번째 sudo 명령
sudo docker-compose down
# -v: 볼륨 삭제



# 두 번째 sudo 명령
# sudo docker-compose build --no-cache

# 세 번째 sudo 명령
sudo docker-compose up --build -d
# --build: 이미지 재빌드 포함
# -d: 백그라운드 모드


# 재시작
# docker compose build <service> --no-cache
# docker compose restart <service>



# 완료 메시지
echo "모든 명령이 성공적으로 실행되었습니다!"

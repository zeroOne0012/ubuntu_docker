FROM nginx

WORKDIR /etc/nginx/

COPY ./default.conf ./conf.d/default.conf
COPY ./nginx.conf ./nginx.conf

# COPY ./private.crt .
# COPY ./private.key .
COPY ./cert.pem .
COPY ./key.pem .
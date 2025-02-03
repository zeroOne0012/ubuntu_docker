FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npx","nodemon", "server.js"]

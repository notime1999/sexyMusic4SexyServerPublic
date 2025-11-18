FROM node:20

RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg wget && \
    ln -s /usr/bin/python3 /usr/bin/python

# Scarica l'ultima versione di yt-dlp
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

CMD ["npm", "start"]
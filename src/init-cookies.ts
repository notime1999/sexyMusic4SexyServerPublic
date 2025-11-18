import fs from 'fs';

const cookies = process.env.YOUTUBE_COOKIES;
if (cookies) {
  const content = cookies.replace(/\\n/g, '\n');
  fs.writeFileSync('/app/cookies.txt', content, 'utf-8');
}
## build runner
FROM node:lts-alpine as build-runner

# Set temp directory
WORKDIR /tmp/app

# Move package.json and package-lock.json (if exists)
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Move source files
COPY src ./src
COPY tsconfig.json .

# Build project
RUN npm run build

## production runner
FROM node:lts-alpine as prod-runner

# Set work directory
WORKDIR /app

# Copy package.json from build-runner
COPY --from=build-runner /tmp/app/package.json /app/package.json
COPY --from=build-runner /tmp/app/package-lock.json* /app/

# Install dependencies
RUN npm install --omit=dev && \
    npm install @fortawesome/fontawesome-free express-ejs-layouts express-basic-auth

# Move build files
COPY --from=build-runner /tmp/app/build /app/build

# Create logs directory
RUN mkdir -p /app/logs

# Expose ports
EXPOSE ${LOG_PORT:-5050}

# Start bot
CMD [ "npm", "run", "start" ]
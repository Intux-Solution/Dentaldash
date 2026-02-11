# Build Stage
FROM node:18-alpine as build

WORKDIR /app

# Install Dependencies
COPY package*.json ./
RUN npm ci

# Copy Source
COPY . .

# Build Arguments (Must be passed during build for CRA to bake them in)
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY

# Set ENV from ARGs
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL
ENV REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY
# If you have other vars (like N8N was removed, but API_KEY might be needed?)
# ENV REACT_APP_API_KEY=$REACT_APP_API_KEY

# Build the app
RUN npm run build

# Serve Stage
FROM nginx:alpine

# Copy build artifacts
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

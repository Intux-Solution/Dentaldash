# Build Stage
FROM node:18-alpine as build

WORKDIR /app

# Install Dependencies
COPY package*.json ./
RUN npm ci

# Copy Source
COPY . .

# Build Arguments (Require these when building so Vite can bake them in)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY

# Map the VITE_ args or fallback directly to the REACT args temporarily 
# incase the Github Actions CI wasn't fully updated yet.
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-$REACT_APP_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY:-$REACT_APP_SUPABASE_ANON_KEY}
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL
ENV REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY

# Build the app
RUN npm run build

# Serve Stage
FROM nginx:alpine

# Copy build artifacts
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

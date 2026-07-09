FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /server ./cmd/server && CGO_ENABLED=0 go build -o /migrate ./cmd/migrate

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /server /server
COPY --from=build /migrate /migrate
COPY migrations /migrations
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV PORT=8080
ENV MIGRATIONS_DIR=/migrations
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]

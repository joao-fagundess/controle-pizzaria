# Compila o contexto preparado (original ou derivado) com Java 23 para homologação local.
FROM maven:3.9.9-eclipse-temurin-23 AS build
WORKDIR /app
ARG MAVEN_OPTS="-Xms64m -Xmx384m"
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp -Dmaven.compiler.parameters=true -DskipTests package org.springframework.boot:spring-boot-maven-plugin:3.4.0:repackage

FROM eclipse-temurin:23-jre AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/*.war /app/app.war
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.war"]

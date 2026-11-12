# Compila o código original com Java 23 e gera um WAR executável para o teste local.
FROM maven:3.9.9-eclipse-temurin-23 AS build
WORKDIR /app
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp -DskipTests package org.springframework.boot:spring-boot-maven-plugin:3.4.0:repackage

FROM eclipse-temurin:23-jre AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/*.war /app/app.war
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.war"]

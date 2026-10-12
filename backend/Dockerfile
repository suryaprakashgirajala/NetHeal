FROM eclipse-temurin:21-jdk

WORKDIR /app

# Copy the plain-Java backend source code into the image.
COPY src ./src

# Compile all backend Java files. This project does not use Maven or Gradle.
RUN mkdir -p out && javac -d out $(find src -type f -name '*.java')

# Render provides the actual port through the PORT environment variable.
EXPOSE 8080

CMD ["sh", "-c", "java -cp out com.netheal.api.NetHealApiServer"]

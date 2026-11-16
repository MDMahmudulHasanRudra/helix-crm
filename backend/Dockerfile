# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/HelixCrm.Api/HelixCrm.Api.csproj src/HelixCrm.Api/
RUN dotnet restore src/HelixCrm.Api/HelixCrm.Api.csproj

COPY src/HelixCrm.Api/ src/HelixCrm.Api/
RUN dotnet publish src/HelixCrm.Api/HelixCrm.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_RUNNING_IN_CONTAINER=true
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "HelixCrm.Api.dll"]

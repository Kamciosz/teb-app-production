FROM python:3.12-slim

LABEL name="teb-app-manager"
LABEL description="TEB-App Manager CLI — zarzadzanie aplikacja szkolna"
LABEL version="7.7"

# Instalacja narzedzi systemowych
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl dnsutils jq && \
    rm -rf /var/lib/apt/lists/*

# Kopiowanie skryptow
WORKDIR /opt/teb-app
COPY scripts/teb-app-manager.py .
COPY scripts/teb-app-completion.sh .
COPY scripts/teb-app-daemon.py .
COPY scripts/badge.py .
COPY scripts/ .
COPY .github/ .github/

# Alias
RUN echo 'alias teb-app="python3 /opt/teb-app/teb-app-manager.py"' >> ~/.bashrc

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python3 /opt/teb-app/teb-app-manager.py health || exit 1

ENTRYPOINT ["python3", "/opt/teb-app/teb-app-manager.py"]
CMD ["health"]

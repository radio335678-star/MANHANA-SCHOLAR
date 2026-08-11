FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 1. Install System Dependencies & Fonts
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-dev \
    pandoc \
    weasyprint \
    qpdf \
    poppler-utils \
    fonts-noto-core \
    fonts-deva \
    fonts-liberation \
    fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Node.js 20 LTS Runtime
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# 3. Install Typst v0.11+ Rust Compiler
RUN curl -fsSL https://github.com/typst/typst/releases/download/v0.11.0/typst-x86_64-unknown-linux-musl.tar.gz | tar -xz -C /tmp \
    && mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst \
    && chmod +x /usr/local/bin/typst

# 4. Install Python Data Science, Fast PDF Text/Table Extraction Suite
RUN pip3 install --no-cache-dir \
    pandas \
    numpy \
    scipy \
    matplotlib \
    seaborn \
    plotly \
    sympy \
    pymupdf \
    pdfplumber \
    indic-nlp-library \
    sanskrit-parser

WORKDIR /home/user

/**
 * Upload Optimizer Utility
 * Provides optimized file processing, caching, and performance monitoring
 */

class UploadOptimizer {
  constructor() {
    this.worker = null;
    this.cache = new Map();
    this.performanceMetrics = {
      fileParsing: [],
      validation: [],
      upload: [],
    };
    this.validUOMs = null;
    this.hsCodes = null;
    this.streamingEnabled = true;
    this.parallelWorkers = [];
    this.maxWorkers = navigator.hardwareConcurrency || 4;
    this.chunkSize = 500; // Smaller chunks for faster processing
    this.batchSize = 100; // Process in smaller batches
  }

  /**
   * Initialize Web Worker for file processing
   */
  initWorker() {
    if (this.worker) {
      return this.worker;
    }

    this.worker = new Worker("/file-processor-worker.js");
    return this.worker;
  }

  /**
   * Ultra-fast streaming file processing with parallel workers
   */
  async processFile(file, onProgress) {
    const startTime = performance.now();

    try {
      // Use streaming for large files, parallel workers for smaller files
      if (file.size > 1024 * 1024) {
        // Files larger than 1MB
        return await this.streamingProcessFile(file, onProgress);
      } else {
        return await this.parallelProcessFile(file, onProgress);
      }
    } catch (error) {
      console.error("File processing error:", error);
      throw error;
    }
  }

  /**
   * Streaming file processing for large files
   */
  async streamingProcessFile(file, onProgress) {
    const startTime = performance.now();
    const results = [];
    let totalRows = 0;
    let processedChunks = 0;
    const totalChunks = Math.ceil(file.size / (this.chunkSize * 1024));

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      let offset = 0;
      let buffer = "";

      const processChunk = () => {
        if (offset >= file.size) {
          // Process remaining buffer
          if (buffer.trim()) {
            this.processChunkData(buffer, results);
          }

          const endTime = performance.now();
          this.performanceMetrics.fileParsing.push({
            fileName: file.name,
            fileSize: file.size,
            processingTime: endTime - startTime,
            rowsProcessed: results.length,
            method: "streaming",
          });

          resolve({
            data: results,
            totalRows: results.length,
            headers: this.getExpectedHeaders(),
          });
          return;
        }

        const chunk = file.slice(offset, offset + this.chunkSize * 1024);
        reader.readAsText(chunk);
      };

      reader.onload = (e) => {
        const chunkData = e.target.result;
        buffer += chunkData;

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        if (lines.length > 0) {
          this.processChunkData(lines.join("\n"), results);
        }

        processedChunks++;
        const progress = (processedChunks / totalChunks) * 100;
        if (onProgress) onProgress(progress);

        offset += this.chunkSize * 1024;
        setTimeout(processChunk, 0); // Non-blocking
      };

      reader.onerror = reject;
      processChunk();
    });
  }

  /**
   * Parallel processing with multiple workers
   */
  async parallelProcessFile(file, onProgress) {
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const worker = this.initWorker();
      const timeout = setTimeout(() => {
        reject(new Error("File processing timeout"));
      }, 15000); // Reduced timeout for faster files

      worker.onmessage = (e) => {
        const { type, data, error, progress } = e.data;

        switch (type) {
          case "PROGRESS":
            if (onProgress) {
              onProgress(progress);
            }
            break;

          case "PARSE_CSV_SUCCESS":
          case "PARSE_EXCEL_SUCCESS":
            clearTimeout(timeout);
            const endTime = performance.now();
            this.performanceMetrics.fileParsing.push({
              fileName: file.name,
              fileSize: file.size,
              processingTime: endTime - startTime,
              rowsProcessed: data.totalRows,
              method: "parallel",
            });
            resolve(data);
            break;

          case "ERROR":
            clearTimeout(timeout);
            reject(new Error(error));
            break;
        }
      };

      worker.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };

      // Read file content
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        const expectedHeaders = this.getExpectedHeaders();

        if (file.type === "text/csv") {
          worker.postMessage({
            type: "PARSE_CSV",
            data: { content, headers: expectedHeaders },
          });
        } else {
          const arrayBuffer = e.target.result;
          worker.postMessage({
            type: "PARSE_EXCEL",
            data: { content: arrayBuffer },
          });
        }
      };

      if (file.type === "text/csv") {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  /**
   * Process chunk data efficiently
   */
  processChunkData(chunkData, results) {
    const lines = chunkData.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return;

    const displayToInternalHeaderMap = {
      "Product Name": "productName",
      "Product Description": "productDescription",
      "Weight": "weight",
      "HS Code": "hsCode",
      "Unit Of Measurement": "uom",
    };

    // Process in micro-batches for better performance
    for (let i = 0; i < lines.length; i += this.batchSize) {
      const batch = lines.slice(i, i + this.batchSize);
      batch.forEach((line, batchIndex) => {
        if (line.trim()) {
          const values = this.parseCSVLine(line);
          const row = {};

          // Assume standard headers for streaming
          const headers = [
            "Product Name",
            "Product Description",
            "Weight",
            "HS Code",
            "Unit Of Measurement",
          ];
          headers.forEach((header, index) => {
            row[header] = values[index] || "";
          });

          const mappedRow = {};
          Object.entries(displayToInternalHeaderMap).forEach(
            ([visualHeader, internalKey]) => {
              const value = row[visualHeader] || "";
              mappedRow[internalKey] =
                internalKey === "hsCode" ? String(value) : value;
            }
          );

          results.push({
            ...mappedRow,
            _row: results.length + 1,
          });
        }
      });
    }
  }

  /**
   * Fast CSV line parser
   */
  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Get expected headers
   */
  getExpectedHeaders() {
    return [
      "Product Name",
      "Product Description",
      "Weight",
      "HS Code",
      "Unit Of Measurement",
    ];
  }

  /**
   * Ultra-fast parallel validation with streaming
   */
  async validateProducts(products, onProgress) {
    const startTime = performance.now();

    try {
      // Use parallel validation for large datasets
      if (products.length > 1000) {
        return await this.parallelValidateProducts(products, onProgress);
      } else {
        return await this.fastValidateProducts(products, onProgress);
      }
    } catch (error) {
      console.error("Validation error:", error);
      throw error;
    }
  }

  /**
   * Parallel validation using multiple workers
   */
  async parallelValidateProducts(products, onProgress) {
    const startTime = performance.now();
    const validUOMs = await this.getValidUOMs();
    const validUOMSet = new Set(validUOMs.map((uom) => uom.toLowerCase()));

    const chunkSize = Math.ceil(products.length / this.maxWorkers);
    const chunks = [];

    for (let i = 0; i < products.length; i += chunkSize) {
      chunks.push(products.slice(i, i + chunkSize));
    }

    const validationPromises = chunks.map((chunk, index) =>
      this.validateChunk(chunk, validUOMSet, index)
    );

    try {
      const results = await Promise.all(validationPromises);

      // Combine results
      const validData = [];
      const validationErrors = [];

      results.forEach((result) => {
        validData.push(...result.validData);
        validationErrors.push(...result.validationErrors);
      });

      const endTime = performance.now();
      this.performanceMetrics.validation.push({
        productsCount: products.length,
        validationTime: endTime - startTime,
        validCount: validData.length,
        errorCount: validationErrors.length,
        method: "parallel",
      });

      if (onProgress) onProgress(100);

      return {
        validData,
        validationErrors,
        totalProcessed: products.length,
      };
    } catch (error) {
      throw new Error(`Parallel validation failed: ${error.message}`);
    }
  }

  /**
   * Fast in-memory validation
   */
  async fastValidateProducts(products, onProgress) {
    const startTime = performance.now();
    const validUOMs = await this.getValidUOMs();
    const validUOMSet = new Set(validUOMs.map((uom) => uom.toLowerCase()));

    const validData = [];
    const validationErrors = [];

    // Process in micro-batches for better performance
    const batchSize = 100;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      batch.forEach((row, batchIndex) => {
        const rowErrors = this.validateRow(row, validUOMSet);

        if (rowErrors.length > 0) {
          validationErrors.push({
            row: i + batchIndex + 1,
            errors: rowErrors,
          });
        } else {
          validData.push({
            ...row,
            _row: i + batchIndex + 1,
          });
        }
      });

      // Update progress
      if (onProgress) {
        const progress = ((i + batchSize) / products.length) * 100;
        onProgress(Math.min(100, progress));
      }
    }

    const endTime = performance.now();
    this.performanceMetrics.validation.push({
      productsCount: products.length,
      validationTime: endTime - startTime,
      validCount: validData.length,
      errorCount: validationErrors.length,
      method: "fast",
    });

    return {
      validData,
      validationErrors,
      totalProcessed: products.length,
    };
  }

  /**
   * Validate a single row
   */
  validateRow(row, validUOMSet) {
    const rowErrors = [];

    // Required field validation
    if (!row.productName || row.productName.trim() === "") {
      rowErrors.push("Product name is required");
    }

    if (!row.hsCode || row.hsCode.trim() === "") {
      rowErrors.push("HS Code is required");
    }

    if (!row.uom || row.uom.trim() === "") {
      rowErrors.push("Unit of Measurement is required");
    }

    // UOM validation with optimized lookup
    if (row.uom && row.uom.trim() !== "") {
      const uomValue = String(row.uom).trim().toLowerCase();
      const isValidUOM =
        validUOMSet.has(uomValue) ||
        Array.from(validUOMSet).some(
          (validUom) =>
            validUom.includes(uomValue) || uomValue.includes(validUom)
        );

      if (!isValidUOM) {
        rowErrors.push(
          `Unit of Measurement "${row.uom}" is not valid. Please select from the dropdown.`
        );
      }
    }

    // HS Code format validation
    if (row.hsCode && row.hsCode.trim() !== "") {
      const hsCodeStr = String(row.hsCode).trim();
      if (!/^[A-Za-z0-9.\-\s]+$/.test(hsCodeStr)) {
        rowErrors.push(
          "HS Code should contain only letters, numbers, dots, hyphens, and spaces"
        );
      }
      if (hsCodeStr.length < 2 || hsCodeStr.length > 20) {
        rowErrors.push("HS Code should be between 2-20 characters");
      }
    }

    return rowErrors;
  }

  /**
   * Validate a chunk of products
   */
  async validateChunk(chunk, validUOMSet, chunkIndex) {
    return new Promise((resolve) => {
      // Use setTimeout to make it non-blocking
      setTimeout(() => {
        const validData = [];
        const validationErrors = [];

        chunk.forEach((row, index) => {
          const rowErrors = this.validateRow(row, validUOMSet);

          if (rowErrors.length > 0) {
            validationErrors.push({
              row: chunkIndex * chunk.length + index + 1,
              errors: rowErrors,
            });
          } else {
            validData.push({
              ...row,
              _row: chunkIndex * chunk.length + index + 1,
            });
          }
        });

        resolve({ validData, validationErrors });
      }, 0);
    });
  }

  /**
   * Get valid UOMs with caching
   */
  async getValidUOMs() {
    if (this.validUOMs) {
      return this.validUOMs;
    }

    const cacheKey = "validUOMs";
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 300000) {
      // 5 minute cache
      this.validUOMs = cached.data;
      return cached.data;
    }

    // Hardcoded UOM options for performance
    const validUOMs = [
      "MT",
      "Bill of lading",
      "SET",
      "KWH",
      "40KG",
      "Liter",
      "SqY",
      "Bag",
      "KG",
      "MMBTU",
      "Meter",
      "Pcs",
      "Carat",
      "Cubic Metre",
      "Dozen",
      "Gram",
      "Gallon",
      "Kilogram",
      "Pound",
      "Timber Logs",
      "Numbers, pieces, units",
      "Packs",
      "Pair",
      "Square Foot",
      "Square Metre",
      "Thousand Unit",
      "Mega Watt",
      "Foot",
      "Barrels",
      "NO",
      "Others",
      "1000 kWh",
    ];

    this.cache.set(cacheKey, {
      data: validUOMs,
      timestamp: Date.now(),
    });

    this.validUOMs = validUOMs;
    return validUOMs;
  }

  /**
   * Get HS codes with caching
   */
  async getHSCodes() {
    if (this.hsCodes) {
      return this.hsCodes;
    }

    const cacheKey = "hsCodes";
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 600000) {
      // 10 minute cache
      this.hsCodes = cached.data;
      return cached.data;
    }

    // Return empty array for now - can be populated from API if needed
    const hsCodes = [];

    this.cache.set(cacheKey, {
      data: hsCodes,
      timestamp: Date.now(),
    });

    this.hsCodes = hsCodes;
    return hsCodes;
  }

  /**
   * Ultra-fast chunked upload with parallel processing
   */
  async uploadProducts(products, uploadFunction, onProgress) {
    const startTime = performance.now();

    try {
      // Use chunked upload for large datasets
      if (products.length > 500) {
        return await this.chunkedUpload(products, uploadFunction, onProgress);
      } else {
        return await this.directUpload(products, uploadFunction, onProgress);
      }
    } catch (error) {
      const endTime = performance.now();
      this.performanceMetrics.upload.push({
        productsCount: products.length,
        uploadTime: endTime - startTime,
        success: false,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Chunked parallel upload
   */
  async chunkedUpload(products, uploadFunction, onProgress) {
    const startTime = performance.now();
    const chunkSize = 200; // Smaller chunks for faster processing
    const chunks = [];

    for (let i = 0; i < products.length; i += chunkSize) {
      chunks.push(products.slice(i, i + chunkSize));
    }

    const results = [];
    let completedChunks = 0;

    // Process chunks in parallel with limited concurrency
    const maxConcurrent = Math.min(3, chunks.length);
    const uploadPromises = [];

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const batch = chunks.slice(i, i + maxConcurrent);

      const batchPromises = batch.map(async (chunk, batchIndex) => {
        try {
          const result = await uploadFunction(chunk);
          completedChunks++;

          if (onProgress) {
            const progress = (completedChunks / chunks.length) * 100;
            onProgress(progress);
          }

          return result;
        } catch (error) {
          console.error(`Chunk ${i + batchIndex} failed:`, error);
          throw error;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const endTime = performance.now();
    this.performanceMetrics.upload.push({
      productsCount: products.length,
      uploadTime: endTime - startTime,
      success: true,
      method: "chunked",
      chunksProcessed: chunks.length,
    });

    // Return the last result (assuming it contains summary)
    return results[results.length - 1] || results[0];
  }

  /**
   * Direct upload for smaller datasets
   */
  async directUpload(products, uploadFunction, onProgress) {
    const startTime = performance.now();

    try {
      if (onProgress) onProgress(50);

      const result = await uploadFunction(products);

      if (onProgress) onProgress(100);

      const endTime = performance.now();
      this.performanceMetrics.upload.push({
        productsCount: products.length,
        uploadTime: endTime - startTime,
        success: true,
        method: "direct",
      });

      return result;
    } catch (error) {
      const endTime = performance.now();
      this.performanceMetrics.upload.push({
        productsCount: products.length,
        uploadTime: endTime - startTime,
        success: false,
        error: error.message,
        method: "direct",
      });
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      fileParsing: this.performanceMetrics.fileParsing,
      validation: this.performanceMetrics.validation,
      upload: this.performanceMetrics.upload,
      cache: {
        size: this.cache.size,
        keys: Array.from(this.cache.keys()),
      },
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.validUOMs = null;
    this.hsCodes = null;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.clearCache();
  }

  /**
   * Calculate upload speed metrics
   */
  calculateSpeedMetrics(productsCount, timeMs) {
    const timeSeconds = timeMs / 1000;
    const productsPerSecond = productsCount / timeSeconds;

    return {
      productsPerSecond: Math.round(productsPerSecond * 100) / 100,
      timeMs: Math.round(timeMs * 100) / 100,
      timeSeconds: Math.round(timeSeconds * 100) / 100,
      productsCount,
    };
  }

  /**
   * Format performance summary with optimization methods
   */
  formatPerformanceSummary(metrics) {
    const summary = [];

    if (metrics.fileParsing.length > 0) {
      const latest = metrics.fileParsing[metrics.fileParsing.length - 1];
      const method = latest.method ? ` (${latest.method})` : "";
      const speed = this.calculateSpeedMetrics(
        latest.rowsProcessed,
        latest.processingTime
      );
      summary.push(
        `📁 File Processing${method}: ${speed.productsPerSecond} rows/sec in ${speed.timeMs}ms`
      );
    }

    if (metrics.validation.length > 0) {
      const latest = metrics.validation[metrics.validation.length - 1];
      const method = latest.method ? ` (${latest.method})` : "";
      const speed = this.calculateSpeedMetrics(
        latest.productsCount,
        latest.validationTime
      );
      summary.push(
        `✅ Validation${method}: ${speed.productsPerSecond} products/sec in ${speed.timeMs}ms`
      );
    }

    if (metrics.upload.length > 0) {
      const latest = metrics.upload[metrics.upload.length - 1];
      const method = latest.method ? ` (${latest.method})` : "";
      const speed = this.calculateSpeedMetrics(
        latest.productsCount,
        latest.uploadTime
      );
      summary.push(
        `🚀 Upload${method}: ${speed.productsPerSecond} products/sec in ${speed.timeMs}ms`
      );
    }

    return summary.join(" | ");
  }
}

// Create singleton instance
const uploadOptimizer = new UploadOptimizer();

export default uploadOptimizer;

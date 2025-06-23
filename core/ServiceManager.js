// core/ServiceManager.js - Unified Service Management
const EventEmitter = require('events');

class ServiceManager extends EventEmitter {
  constructor() {
    super();
    this.services = new Map();
    this.dependencies = new Map();
    this.initializationOrder = [];
    this.initialized = new Set();
    this.initializing = new Set();
    this.config = {};
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  // Register a service with its dependencies
  registerService(name, serviceClass, dependencies = []) {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.services.set(name, {
      name,
      serviceClass,
      dependencies,
      instance: null,
      initialized: false
    });

    this.dependencies.set(name, dependencies);
    console.log(`📝 Service '${name}' registered with dependencies: [${dependencies.join(', ')}]`);
  }

  // Get service instance (initialize if needed)
  async getService(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' is not registered`);
    }

    const serviceInfo = this.services.get(name);
    
    if (serviceInfo.instance && serviceInfo.initialized) {
      return serviceInfo.instance;
    }

    if (this.initializing.has(name)) {
      throw new Error(`Circular dependency detected: ${name} is already being initialized`);
    }

    return await this.initializeService(name);
  }

  // Initialize a service and its dependencies
  async initializeService(name) {
    if (this.initialized.has(name)) {
      return this.services.get(name).instance;
    }

    if (this.initializing.has(name)) {
      throw new Error(`Circular dependency detected while initializing '${name}'`);
    }

    const serviceInfo = this.services.get(name);
    if (!serviceInfo) {
      throw new Error(`Service '${name}' is not registered`);
    }

    console.log(`🔧 Initializing service '${name}'...`);
    this.initializing.add(name);

    try {
      // Initialize dependencies first
      const dependencyInstances = {};
      for (const depName of serviceInfo.dependencies) {
        dependencyInstances[depName] = await this.getService(depName);
      }

      // Create service instance
      const ServiceClass = serviceInfo.serviceClass;
      const instance = new ServiceClass({
        config: this.config,
        dependencies: dependencyInstances,
        serviceManager: this
      });

      // Initialize the service if it has an init method
      if (typeof instance.initialize === 'function') {
        await instance.initialize();
      }

      serviceInfo.instance = instance;
      serviceInfo.initialized = true;
      this.initialized.add(name);
      this.initializing.delete(name);

      console.log(`✅ Service '${name}' initialized successfully`);
      this.emit('serviceInitialized', name, instance);

      return instance;

    } catch (error) {
      this.initializing.delete(name);
      console.error(`❌ Failed to initialize service '${name}':`, error.message);
      throw new Error(`Failed to initialize service '${name}': ${error.message}`);
    }
  }

  // Initialize all services in dependency order
  async initializeAll() {
    console.log('🚀 Initializing all services...');
    
    const order = this.getInitializationOrder();
    console.log(`📋 Initialization order: ${order.join(' → ')}`);

    for (const serviceName of order) {
      try {
        await this.initializeService(serviceName);
      } catch (error) {
        console.error(`❌ Failed to initialize service '${serviceName}':`, error.message);
        throw error;
      }
    }

    console.log('✅ All services initialized successfully');
  }

  // Calculate dependency-based initialization order
  getInitializationOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (name) => {
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${Array.from(visiting).join(' → ')} → ${name}`);
      }

      if (visited.has(name)) {
        return;
      }

      visiting.add(name);

      const dependencies = this.dependencies.get(name) || [];
      for (const dep of dependencies) {
        if (!this.services.has(dep)) {
          throw new Error(`Service '${name}' depends on '${dep}' which is not registered`);
        }
        visit(dep);
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    for (const serviceName of this.services.keys()) {
      visit(serviceName);
    }

    return order;
  }

  // Get service status
  getStatus() {
    const status = {
      total: this.services.size,
      initialized: this.initialized.size,
      initializing: this.initializing.size,
      services: {}
    };

    for (const [name, serviceInfo] of this.services.entries()) {
      status.services[name] = {
        initialized: serviceInfo.initialized,
        dependencies: serviceInfo.dependencies,
        instance: !!serviceInfo.instance
      };
    }

    return status;
  }

  // Graceful shutdown of all services
  async shutdown() {
    console.log('🛑 Shutting down services...');

    // Shutdown in reverse order
    const order = this.getInitializationOrder().reverse();

    for (const serviceName of order) {
      try {
        const serviceInfo = this.services.get(serviceName);
        if (serviceInfo?.instance && typeof serviceInfo.instance.shutdown === 'function') {
          console.log(`🔄 Shutting down service '${serviceName}'...`);
          await serviceInfo.instance.shutdown();
          console.log(`✅ Service '${serviceName}' shut down`);
        }
      } catch (error) {
        console.error(`❌ Error shutting down service '${serviceName}':`, error.message);
      }
    }

    // Clear all services
    this.services.clear();
    this.dependencies.clear();
    this.initialized.clear();
    this.initializing.clear();

    console.log('✅ All services shut down');
  }

  // Health check for all services
  async healthCheck() {
    const results = {};

    for (const [name, serviceInfo] of this.services.entries()) {
      try {
        if (serviceInfo.instance && typeof serviceInfo.instance.healthCheck === 'function') {
          results[name] = await serviceInfo.instance.healthCheck();
        } else {
          results[name] = { healthy: serviceInfo.initialized, message: 'No health check method' };
        }
      } catch (error) {
        results[name] = { healthy: false, message: error.message };
      }
    }

    return results;
  }

  // Check if service exists and is initialized
  isServiceReady(name) {
    const serviceInfo = this.services.get(name);
    return serviceInfo && serviceInfo.initialized && serviceInfo.instance;
  }

  // Get all initialized services
  getAllServices() {
    const services = {};
    for (const [name, serviceInfo] of this.services.entries()) {
      if (serviceInfo.initialized && serviceInfo.instance) {
        services[name] = serviceInfo.instance;
      }
    }
    return services;
  }
}

// Singleton instance
let instance = null;

function createServiceManager() {
  if (!instance) {
    instance = new ServiceManager();
  }
  return instance;
}

function getServiceManager() {
  if (!instance) {
    throw new Error('ServiceManager not created. Call createServiceManager() first.');
  }
  return instance;
}

module.exports = {
  ServiceManager,
  createServiceManager,
  getServiceManager
}; 
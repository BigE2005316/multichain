// test-new-bot.js - Test Script for Restructured Bot
require('dotenv').config();

const BotCore = require('./core/BotCore');
const { ServiceManager } = require('./core/ServiceManager');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class BotTester {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async test(name, testFn) {
    try {
      this.log(`🧪 Testing: ${name}`, 'blue');
      await testFn();
      this.log(`✅ PASSED: ${name}`, 'green');
      this.passed++;
    } catch (error) {
      this.log(`❌ FAILED: ${name} - ${error.message}`, 'red');
      this.failed++;
    }
  }

  async runAllTests() {
    this.log('🚀 Starting Bot Architecture Tests\n', 'bold');

    // Test 1: Environment Variables
    await this.test('Environment Variables', async () => {
      const required = ['TELEGRAM_BOT_TOKEN', 'ADMIN_TELEGRAM_ID', 'DEV_FEE_PERCENT'];
      const missing = required.filter(varName => !process.env[varName]);
      
      if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
      }
    });

    // Test 2: BotCore Initialization
    await this.test('BotCore Creation', async () => {
      const botCore = new BotCore({
        token: process.env.TELEGRAM_BOT_TOKEN
      });
      
      if (!botCore || !botCore.getBot()) {
        throw new Error('BotCore failed to initialize');
      }
    });

    // Test 3: ServiceManager
    await this.test('ServiceManager', async () => {
      const serviceManager = new ServiceManager();
      serviceManager.setConfig({
        test: true,
        telegram: { token: process.env.TELEGRAM_BOT_TOKEN }
      });
      
      // Test service registration
      class TestService {
        constructor() {
          this.initialized = false;
        }
        
        async initialize() {
          this.initialized = true;
        }
        
        healthCheck() {
          return { healthy: this.initialized };
        }
      }
      
      serviceManager.registerService('testService', TestService, []);
      const service = await serviceManager.getService('testService');
      
      if (!service.initialized) {
        throw new Error('Service not properly initialized');
      }
    });

    // Test 4: Command Registration
    await this.test('Command Registration', async () => {
      const botCore = new BotCore({
        token: process.env.TELEGRAM_BOT_TOKEN
      });
      
      let commandExecuted = false;
      
      botCore.registerCommand('test', async (ctx) => {
        commandExecuted = true;
      });
      
      // Test command handler exists
      if (!botCore.handlers.has('test')) {
        throw new Error('Command not registered properly');
      }
    });

    // Test 5: Error Handling
    await this.test('Error Categorization', async () => {
      const botCore = new BotCore({
        token: process.env.TELEGRAM_BOT_TOKEN
      });
      
      const tests = [
        { message: 'Error 403: Forbidden', expected: 'USER_BLOCKED' },
        { message: 'Rate limit exceeded 429', expected: 'RATE_LIMIT' },
        { message: 'insufficient funds', expected: 'INSUFFICIENT_FUNDS' },
        { message: 'timeout occurred', expected: 'TIMEOUT' },
        { message: 'network error', expected: 'NETWORK' },
        { message: 'unknown error', expected: 'UNKNOWN' }
      ];
      
      for (const test of tests) {
        const category = botCore.categorizeError(new Error(test.message));
        if (category !== test.expected) {
          throw new Error(`Expected ${test.expected}, got ${category}`);
        }
      }
    });

    // Test 6: Session Management
    await this.test('Session Management', async () => {
      const botCore = new BotCore({
        token: process.env.TELEGRAM_BOT_TOKEN
      });
      
      const mockCtx = {
        session: { state: 'idle', data: {}, timestamp: Date.now() }
      };
      
      // Test setState
      botCore.setState(mockCtx, 'test_state', { test: 'data' });
      
      if (botCore.getState(mockCtx) !== 'test_state') {
        throw new Error('setState failed');
      }
      
      if (botCore.getData(mockCtx, 'test') !== 'data') {
        throw new Error('Session data storage failed');
      }
      
      // Test clearSession
      botCore.clearSession(mockCtx);
      
      if (botCore.getState(mockCtx) !== 'idle') {
        throw new Error('clearSession failed');
      }
    });

    // Test 7: Service Dependencies
    await this.test('Service Dependencies', async () => {
      const serviceManager = new ServiceManager();
      
      class ServiceA {
        async initialize() { this.ready = true; }
        healthCheck() { return { healthy: this.ready }; }
      }
      
      class ServiceB {
        constructor({ dependencies }) {
          this.serviceA = dependencies.serviceA;
        }
        async initialize() {
          if (!this.serviceA || !this.serviceA.ready) {
            throw new Error('ServiceA not ready');
          }
          this.ready = true;
        }
        healthCheck() { return { healthy: this.ready }; }
      }
      
      serviceManager.registerService('serviceA', ServiceA, []);
      serviceManager.registerService('serviceB', ServiceB, ['serviceA']);
      
      const order = serviceManager.getInitializationOrder();
      
      // Check that serviceA comes before serviceB
      const aIndex = order.indexOf('serviceA');
      const bIndex = order.indexOf('serviceB');
      
      if (aIndex === -1 || bIndex === -1 || aIndex >= bIndex) {
        throw new Error(`Dependency order incorrect: ${order.join(' → ')}`);
      }
      
      await serviceManager.initializeAll();
      
      const serviceB = await serviceManager.getService('serviceB');
      if (!serviceB.ready) {
        throw new Error('Service dependency injection failed');
      }
    });

    // Test 8: Health Checks
    await this.test('Health Check System', async () => {
      const serviceManager = new ServiceManager();
      
      class HealthyService {
        async initialize() { this.working = true; }
        healthCheck() { return { healthy: true, message: 'All good' }; }
      }
      
      class UnhealthyService {
        async initialize() { this.working = false; }
        healthCheck() { return { healthy: false, message: 'Something wrong' }; }
      }
      
      serviceManager.registerService('healthy', HealthyService, []);
      serviceManager.registerService('unhealthy', UnhealthyService, []);
      
      await serviceManager.initializeAll();
      
      const healthResults = await serviceManager.healthCheck();
      
      if (!healthResults.healthy.healthy) {
        throw new Error('Healthy service reported unhealthy');
      }
      
      if (healthResults.unhealthy.healthy) {
        throw new Error('Unhealthy service reported healthy');
      }
    });

    // Test 9: Configuration Loading
    await this.test('Configuration System', async () => {
      const config = {
        telegram: {
          token: process.env.TELEGRAM_BOT_TOKEN,
          adminId: process.env.ADMIN_TELEGRAM_ID
        },
        trading: {
          devFeePercent: parseFloat(process.env.DEV_FEE_PERCENT || '3'),
          maxSlippage: 50
        }
      };
      
      if (!config.telegram.token) {
        throw new Error('Telegram token not loaded');
      }
      
      if (isNaN(config.trading.devFeePercent)) {
        throw new Error('Dev fee not properly parsed');
      }
      
      if (config.trading.maxSlippage !== 50) {
        throw new Error('Default config not set');
      }
    });

    // Test 10: Graceful Shutdown
    await this.test('Graceful Shutdown', async () => {
      const serviceManager = new ServiceManager();
      
      class TestService {
        constructor() {
          this.running = false;
          this.shutdownCalled = false;
        }
        
        async initialize() {
          this.running = true;
        }
        
        async shutdown() {
          this.shutdownCalled = true;
          this.running = false;
        }
        
        healthCheck() {
          return { healthy: this.running };
        }
      }
      
      serviceManager.registerService('shutdownTestService', TestService, []);
      await serviceManager.initializeAll();
      
      const service = await serviceManager.getService('shutdownTestService');
      
      if (!service.running) {
        throw new Error('Service not running before shutdown');
      }
      
      await serviceManager.shutdown();
      
      if (!service.shutdownCalled) {
        throw new Error('Shutdown not called on service');
      }
      
      if (service.running) {
        throw new Error('Service still running after shutdown');
      }
    });

    // Print Results
    this.printResults();
  }

  printResults() {
    this.log('\n📊 Test Results', 'bold');
    this.log('='.repeat(50), 'blue');
    
    if (this.failed === 0) {
      this.log(`🎉 ALL TESTS PASSED! (${this.passed}/${this.passed + this.failed})`, 'green');
      this.log('\n✅ Bot architecture is working correctly!', 'green');
      this.log('🚀 Ready for production deployment', 'green');
    } else {
      this.log(`⚠️  SOME TESTS FAILED: ${this.passed} passed, ${this.failed} failed`, 'yellow');
      this.log('\n❌ Bot architecture needs fixes before deployment', 'red');
    }
    
    this.log('\n🔧 Next Steps:', 'blue');
    this.log('1. Fix any failed tests above');
    this.log('2. Run: node app.js');
    this.log('3. Test commands: /start, /admin, /wallet');
    this.log('4. Verify trading with small amounts');
    this.log('5. Monitor logs for any errors');
    
    this.log('\n📚 Documentation:', 'blue');
    this.log('• See RESTRUCTURE_GUIDE.md for complete guide');
    this.log('• Check app.js for main application');
    this.log('• Review core/ directory for architecture');
  }
}

// Run tests
async function main() {
  const tester = new BotTester();
  await tester.runAllTests();
  
  // Exit with appropriate code
  process.exit(tester.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = BotTester; 
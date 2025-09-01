// prisma/seeds/services/04_ai_service_config.js

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

// Create a custom ID generator
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10);

/**
 * Seed the AI Service configuration
 */
export async function seedAiServiceConfig() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Checking for existing AI Service configuration...');
    
    // Check if config already exists
    const existingConfig = await prisma.config_ai_service.findFirst();
    
    if (existingConfig) {
      console.log('✅ AI Service configuration already exists, skipping seed.');
      return;
    }
    
    console.log('🌱 Creating initial AI Service configuration...');
    
    // Default model loadouts
    const defaultModelLoadouts = {
      default: {
        model: "gpt-4.1-mini",
        maxTokens: 4048,
        temperature: 0.4
      },
      errorAnalysis: {
        model: "gpt-4.1-mini",
        maxTokens: 4048,
        temperature: 0.4
      },
      adminAnalysis: {
        model: "gpt-4.1-mini",
        maxTokens: 4048,
        temperature: 0.4
      },
      degenTerminal: {
        model: "gpt-4.1-mini",
        maxTokens: 4048,
        temperature: 0.4
      },
      trading: {
        model: "gpt-4.1-mini",
        maxTokens: 4048,
        temperature: 0.4
      },
      support: {
        model: "gpt-4.1-mini",
        maxTokens: 4048,
        temperature: 0.4
      }
    };
    
    // Default system prompts
    const defaultSystemPrompts = {
      errorAnalysis: "You are an expert system analyst specializing in identifying JavaScript error patterns. Your task is to analyze a batch of client-side errors and provide a comprehensive assessment that includes: 1) Common root causes, 2) Severity classification, 3) Recommendations for fixes, and 4) Patterns across different browsers or devices.",
      adminAnalysis: "You are an administrative operations analyst for a crypto trading platform. Review admin actions to identify unusual patterns, security concerns, and improvement opportunities. Focus on frequency, timing, and impact of changes.",
      degenTerminal: "You are DegenDuel's AI assistant. You help users with platform questions, trading strategies, and token insights. Maintain a casual but informative tone. Don't make price predictions but you can discuss trends and metrics."
    };
    
    // Create default configuration
    await prisma.config_ai_service.create({
      data: {
        id: nanoid(),
        // Core Configuration
        check_interval_ms: 10 * (60 * 1000), // 10 minutes
        
        // Analysis Settings
        client_error_lookback_minutes: 10,
        min_errors_to_analyze: 1,
        admin_action_lookback_minutes: 10,
        min_actions_to_analyze: 1,
        
        // Model Configurations
        model_loadouts: defaultModelLoadouts,
        
        // System Prompts
        system_prompts: defaultSystemPrompts,
        
        // Circuit Breaker
        failure_threshold: 3,
        reset_timeout_ms: 10 * (60 * 1000), // 10 minutes
        
        // Rate Limiting
        max_tokens_per_minute: 100000,
        max_conversations_per_user: 5,
        
        // Feature Flags
        enable_error_analysis: true,
        enable_admin_analysis: true,
        enable_user_ai_convos: true,
        
        // Metadata
        updated_by: 'system',
      }
    });
    
    console.log('✅ Initial AI Service configuration created successfully.');
  } catch (error) {
    console.error('❌ Error seeding AI Service configuration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run directly if called from CLI
if (process.argv[1].includes('04_ai_service_config.js')) {
  seedAiServiceConfig()
    .then(() => console.log('AI Service config seed complete.'))
    .catch(console.error);
}
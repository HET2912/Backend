const Transaction = require("../models/Transaction");
const Goal = require("../models/WishlistItem");
const Investment = require("../models/Investment");
const Category = require("../models/Category");

const parseInvestmentAmount = (entry) =>
  Number(entry.amount ?? entry.investedAmount ?? 0);

const buildInvestmentSummary = async (userId, monthStart, monthEnd) => {
  const investments = await Investment.find({ userId }).lean();

  const totals = investments.reduce(
    (acc, entry) => {
      const amount = parseInvestmentAmount(entry);
      if (entry.entryType === "withdrawal") {
        acc.totalUsed += amount;
      } else {
        acc.totalSaved += amount;
      }
      return acc;
    },
    { totalSaved: 0, totalUsed: 0 }
  );

  const currentMonth = investments.reduce(
    (acc, entry) => {
      const entryDate = new Date(entry.date);
      if (entryDate < monthStart || entryDate >= monthEnd) {
        return acc;
      }

      const amount = parseInvestmentAmount(entry);
      if (entry.entryType === "withdrawal") {
        acc.usedAmount += amount;
      } else {
        acc.savedAmount += amount;
      }
      return acc;
    },
    { savedAmount: 0, usedAmount: 0 }
  );

  return {
    totals: {
      totalSaved: totals.totalSaved,
      totalUsed: totals.totalUsed,
      currentBalance: totals.totalSaved - totals.totalUsed,
    },
    currentMonth: {
      savedAmount: currentMonth.savedAmount,
      usedAmount: currentMonth.usedAmount,
      netSaved: currentMonth.savedAmount - currentMonth.usedAmount,
    },
  };
};

const buildPrompt = (transactions) => {
  const compactRows = transactions.map((tx) => ({
    amount: tx.amount,
    type: tx.type,
    categoryId: tx.categoryId,
    date: tx.date,
    notes: tx.notes || "",
  }));

  return `You are a personal finance coach.
Analyze the following last-30-days transaction dataset and return practical insights.

Return STRICT JSON only, using this shape:
{
  "topInsights": ["..."],
  "savingsTips": ["..."],
  "riskAlerts": ["..."],
  "nextWeekActions": ["..."]
}

Rules:
- Keep each tip concise and actionable.
- Mention spending patterns and category-level observations where relevant.
- Avoid any markdown.

Transactions:
${JSON.stringify(compactRows, null, 2)}`;
};

const parseJsonFromText = (text) => {
  if (!text || typeof text !== "string") {
    throw new Error("Model response content missing");
  }

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    }
    throw new Error("Model response could not be parsed as JSON");
  }
};

const getGeminiModelCandidates = () => {
  const configuredModel = (process.env.GEMINI_MODEL || "").trim();
  const candidates = [configuredModel, "gemini-2.5-flash"].filter(Boolean);
  return [...new Set(candidates)];
};

const generateGeminiJson = async (prompt, systemInstruction) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const models = getGeminiModelCandidates();
  let lastError = null;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = new Error(
        `Gemini request failed for model ${model} with status ${response.status}: ${errorText}`
      );

      if (response.status === 404) {
        continue;
      }

      throw lastError;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim();

    return parseJsonFromText(text);
  }

  throw lastError || new Error("Gemini request failed for all candidate models");
};

const buildComprehensivePrompt = (monthlyData, goals, investmentSummary) => {
  return `You are an expert financial advisor. Analyze the following comprehensive financial data and provide detailed insights.

Monthly Data: ${JSON.stringify(monthlyData, null, 2)}
Goals: ${JSON.stringify(goals, null, 2)}
Investment Summary: ${JSON.stringify(investmentSummary, null, 2)}

Return STRICT JSON only, using this shape:
{
  "monthlyAnalysis": {
    "income": number,
    "expenses": number,
    "savings": number,
    "savingsRate": number,
    "topCategories": [{"category": "string", "amount": number, "percentage": number}],
    "spendingTrends": [{"month": "string", "income": number, "expenses": number}]
  },
  "futurePlanning": {
    "projectedSavings": [{"month": "string", "amount": number}],
    "financialGoals": [{"goal": "string", "timeline": "string", "monthlySavings": number}],
    "riskAssessment": "string",
    "recommendations": ["string"]
  },
  "personalizedAdvice": {
    "immediateActions": ["string"],
    "monthlyHabits": ["string"],
    "longTermStrategies": ["string"]
  }
}

Rules:
- Use Investment Summary currentMonth.netSaved as the user's monthly savings
- Savings rate as (savings/income) * 100
- Top categories should be top 5 expense categories with amounts and percentages
- Projected savings should show cumulative savings over 12 months
- Risk assessment should be "Low Risk", "Medium Risk", or "High Risk" based on savings rate
- Keep all advice practical and actionable
- Timeline for goals should be estimated months to completion based on current savings rate`;
};

const getRuleBasedFallback = (transactions) => {
  const totalIncome = transactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = transactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  return {
    topInsights: [
      `Last 30 days income: ${totalIncome.toFixed(2)}, expense: ${totalExpense.toFixed(2)}.`,
      `Estimated savings rate: ${savingsRate.toFixed(1)}%.`,
    ],
    savingsTips: [
      "Set a weekly expense cap and track progress every Sunday.",
      "Auto-transfer a fixed amount to savings right after income credits.",
    ],
    riskAlerts: [
      totalExpense > totalIncome
        ? "Expenses are above income this month; reduce discretionary spending immediately."
        : "No immediate cashflow risk detected from the last 30 days.",
    ],
    nextWeekActions: [
      "Review top 3 largest expenses and tag one to reduce.",
      "Plan category budgets for food, transport, and subscriptions.",
    ],
    source: "fallback",
  };
};

const getRuleBasedComprehensiveFallback = (monthlyData, goals, investmentSummary) => {
  const { income, expenses, topCategories, spendingTrends } = monthlyData;
  const savings = Number(investmentSummary?.currentMonth?.netSaved || 0);
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const currentSavingsBalance = Number(
    investmentSummary?.totals?.currentBalance || 0
  );

  // If no data, provide helpful getting started messages
  if (income === 0 && expenses === 0 && currentSavingsBalance === 0 && goals.length === 0) {
    return {
      monthlyAnalysis: {
        income: 0,
        expenses: 0,
        savings: 0,
        savingsRate: 0,
        topCategories: [],
        spendingTrends: []
      },
      futurePlanning: {
        projectedSavings: [],
        financialGoals: [],
        riskAssessment: "No data available yet",
        recommendations: [
          "Start by adding your income transactions",
          "Track your daily expenses to get personalized insights",
          "Set up your first savings goal",
          "Connect your bank accounts for automatic tracking"
        ]
      },
      personalizedAdvice: {
        immediateActions: [
          "Add your first income transaction",
          "Record today's expenses",
          "Set a monthly savings goal"
        ],
        monthlyHabits: [
          "Track all income and expenses daily",
          "Review spending patterns weekly",
          "Set realistic budget limits",
          "Save at least 20% of income"
        ],
        longTermStrategies: [
          "Build an emergency fund (3-6 months expenses)",
          "Invest in diversified portfolio",
          "Plan for major financial goals",
          "Consider additional income sources"
        ]
      },
      source: "fallback"
    };
  }

  // Projected savings over 12 months
  const projectedSavings = [];
  for (let i = 1; i <= 12; i++) {
    projectedSavings.push({
      month: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      amount: currentSavingsBalance + savings * i
    });
  }

  // Financial goals analysis
  const financialGoals = goals.map(goal => {
    const remaining = Math.max(0, Number(goal.targetAmount || 0) - Number(goal.savedAmount || 0));
    const monthsToGoal = savings > 0 ? Math.ceil(remaining / savings) : 0;
    return {
      goal: goal.itemName,
      timeline: remaining === 0 ? "Completed" : monthsToGoal > 0 ? `${monthsToGoal} months` : 'Ongoing',
      monthlySavings: savings
    };
  });

  // Risk assessment
  let riskAssessment = "Low Risk";
  if (savingsRate < 10) riskAssessment = "High Risk - Increase savings immediately";
  else if (savingsRate < 20) riskAssessment = "Medium Risk - Consider increasing savings";
  else if (savingsRate < 30) riskAssessment = "Low Risk - Good progress";

  return {
    monthlyAnalysis: {
      income,
      expenses,
      savings,
      savingsRate,
      topCategories,
      spendingTrends
    },
    futurePlanning: {
      projectedSavings,
      financialGoals,
      riskAssessment,
      recommendations: [
        savingsRate < 20 ? "Aim to save at least 20% of your income monthly" : "Continue maintaining your current savings rate",
        "Create an emergency fund covering 3-6 months of expenses",
        "Set up automatic transfers to savings accounts",
        currentSavingsBalance > 0
          ? `Your current savings balance is ${currentSavingsBalance.toFixed(2)}. Protect it from non-essential withdrawals.`
          : "Track expenses daily for better financial awareness"
      ]
    },
    personalizedAdvice: {
      immediateActions: [
        "Review your largest expenses from this month",
        "Set a spending limit for your top spending category",
        "Transfer today's savings to a separate account"
      ],
      monthlyHabits: [
        "Review monthly budget vs actual spending",
        "Increase savings rate by 1-2% each month",
        "Plan major purchases in advance",
        "Use cash or debit for discretionary spending"
      ],
      longTermStrategies: [
        "Build an emergency fund (3-6 months expenses)",
        "Invest in diversified portfolio for long-term growth",
        "Consider additional income streams",
        "Plan for major life goals with specific timelines"
      ]
    },
    source: "fallback"
  };
};

const getInsights = async (req, res, next) => {
  let txForFallback = [];
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const transactions =
      Array.isArray(req.body.transactions) && req.body.transactions.length > 0
        ? req.body.transactions
        : await Transaction.find({
          userId: req.user._id,
          date: { $gte: thirtyDaysAgo },
        })
          .sort({ date: -1 })
          .lean();
    txForFallback = transactions;

    if (!transactions.length) {
      return res.status(200).json({
        success: true,
        insights: {
          topInsights: ["No transactions found in the last 30 days."],
          savingsTips: ["Start tracking daily expenses to unlock personalized insights."],
          riskAlerts: [],
          nextWeekActions: ["Add at least 5 transactions this week."],
          source: "fallback",
        },
      });
    }

    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
    if (!hasGeminiKey) {
      return res.status(200).json({
        success: true,
        insights: getRuleBasedFallback(transactions),
      });
    }

    const parsed = await generateGeminiJson(
      buildPrompt(transactions),
      "You are an expert personal finance analyst."
    );

    return res.status(200).json({
      success: true,
      insights: { ...parsed, source: "gemini" },
    });
  } catch (err) {
    return res.status(200).json({
      success: true,
      insights: getRuleBasedFallback(txForFallback),
      warning: "Gemini call failed, fallback insights returned.",
    });
  }
};

const getComprehensiveInsights = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get current month data
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 1);

    const monthlyTransactions = await Transaction.find({
      userId,
      date: {
        $gte: monthStart,
        $lt: monthEnd
      }
    }).lean();

    const monthlyIncome = monthlyTransactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlyExpenses = monthlyTransactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const expenseCategoryIds = [
      ...new Set(
        monthlyTransactions
          .filter((tx) => tx.type === "expense" && tx.categoryId)
          .map((tx) => tx.categoryId)
      ),
    ];
    const categories = expenseCategoryIds.length
      ? await Category.find({
          _id: { $in: expenseCategoryIds },
          userId,
        })
          .select("name")
          .lean()
      : [];
    const categoryNameMap = new Map(
      categories.map((category) => [String(category._id), category.name])
    );

    // Category analysis
    const categoryTotals = {};
    monthlyTransactions.forEach(tx => {
      if (tx.type === 'expense') {
        categoryTotals[tx.categoryId] = (categoryTotals[tx.categoryId] || 0) + tx.amount;
      }
    });

    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, amount]) => ({
        category: categoryNameMap.get(String(category)) || category,
        amount,
        percentage: monthlyExpenses > 0 ? (amount / monthlyExpenses) * 100 : 0
      }));

    // Spending trends (last 6 months)
    const spendingTrends = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const monthTransactions = await Transaction.find({
        userId,
        date: {
          $gte: new Date(date.getFullYear(), date.getMonth(), 1),
          $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
        }
      }).lean();

      const monthIncome = monthTransactions
        .filter(tx => tx.type === 'income')
        .reduce((sum, tx) => sum + tx.amount, 0);

      const monthExpenses = monthTransactions
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + tx.amount, 0);

      spendingTrends.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        income: monthIncome,
        expenses: monthExpenses
      });
    }

    const monthlyData = {
      income: monthlyIncome,
      expenses: monthlyExpenses,
      topCategories,
      spendingTrends
    };

    // Get goals and investment summary
    const goals = await Goal.find({ userId }).lean();
    const investmentSummary = await buildInvestmentSummary(userId, monthStart, monthEnd);

    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
    if (!hasGeminiKey) {
      return res.status(200).json({
        success: true,
        insights: getRuleBasedComprehensiveFallback(monthlyData, goals, investmentSummary),
      });
    }

    const parsed = await generateGeminiJson(
      buildComprehensivePrompt(monthlyData, goals, investmentSummary),
      "You are an expert financial advisor providing comprehensive financial analysis."
    );

    const fallbackInsights = getRuleBasedComprehensiveFallback(
      monthlyData,
      goals,
      investmentSummary
    );
    const parsedFuturePlanning = parsed.futurePlanning || {};
    const parsedPersonalizedAdvice = parsed.personalizedAdvice || {};
    const mergedInsights = {
      ...fallbackInsights,
      ...parsed,
      monthlyAnalysis: {
        ...fallbackInsights.monthlyAnalysis,
        ...(parsed.monthlyAnalysis || {}),
        income: monthlyIncome,
        expenses: monthlyExpenses,
        savings: Number(investmentSummary?.currentMonth?.netSaved || 0),
        savingsRate:
          monthlyIncome > 0
            ? (Number(investmentSummary?.currentMonth?.netSaved || 0) / monthlyIncome) * 100
            : 0,
        topCategories,
        spendingTrends,
      },
      futurePlanning: {
        ...fallbackInsights.futurePlanning,
        ...parsedFuturePlanning,
        projectedSavings:
          Array.isArray(parsedFuturePlanning.projectedSavings) &&
          parsedFuturePlanning.projectedSavings.length > 0
            ? parsedFuturePlanning.projectedSavings
            : fallbackInsights.futurePlanning.projectedSavings,
        financialGoals:
          Array.isArray(parsedFuturePlanning.financialGoals) &&
          parsedFuturePlanning.financialGoals.length > 0
            ? parsedFuturePlanning.financialGoals
            : fallbackInsights.futurePlanning.financialGoals,
        recommendations:
          Array.isArray(parsedFuturePlanning.recommendations) &&
          parsedFuturePlanning.recommendations.length > 0
            ? parsedFuturePlanning.recommendations
            : fallbackInsights.futurePlanning.recommendations,
      },
      personalizedAdvice: {
        ...fallbackInsights.personalizedAdvice,
        ...parsedPersonalizedAdvice,
        immediateActions:
          Array.isArray(parsedPersonalizedAdvice.immediateActions) &&
          parsedPersonalizedAdvice.immediateActions.length > 0
            ? parsedPersonalizedAdvice.immediateActions
            : fallbackInsights.personalizedAdvice.immediateActions,
        monthlyHabits:
          Array.isArray(parsedPersonalizedAdvice.monthlyHabits) &&
          parsedPersonalizedAdvice.monthlyHabits.length > 0
            ? parsedPersonalizedAdvice.monthlyHabits
            : fallbackInsights.personalizedAdvice.monthlyHabits,
        longTermStrategies:
          Array.isArray(parsedPersonalizedAdvice.longTermStrategies) &&
          parsedPersonalizedAdvice.longTermStrategies.length > 0
            ? parsedPersonalizedAdvice.longTermStrategies
            : fallbackInsights.personalizedAdvice.longTermStrategies,
      },
    };

    return res.status(200).json({
      success: true,
      insights: { ...mergedInsights, source: "gemini" },
    });
  } catch (err) {
    console.error('Comprehensive insights error:', err);
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 1);
    const [monthlyTransactions, goals, investmentSummary] = await Promise.all([
      Transaction.find({
        userId: req.user._id,
        date: { $gte: monthStart, $lt: monthEnd },
      }).lean(),
      Goal.find({ userId: req.user._id }).lean(),
      buildInvestmentSummary(req.user._id, monthStart, monthEnd),
    ]);
    const monthlyIncome = monthlyTransactions
      .filter((tx) => tx.type === "income")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const monthlyExpenses = monthlyTransactions
      .filter((tx) => tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0);
    return res.status(200).json({
      success: true,
      insights: getRuleBasedComprehensiveFallback(
        {
          income: monthlyIncome,
          expenses: monthlyExpenses,
          topCategories: [],
          spendingTrends: [],
        },
        goals,
        investmentSummary
      ),
      warning: "Gemini analysis failed, basic insights returned.",
    });
  }
};

module.exports = {
  getInsights,
  getComprehensiveInsights,
};

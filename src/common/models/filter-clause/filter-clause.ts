'use strict';

import { Class, Instance, isInstanceOf } from 'immutable-class';
import { Timezone, Duration, minute } from 'chronoshift';
import { $, r, Expression, ExpressionJS, LiteralExpression, RefExpression, Set, SetJS, ChainExpression, NotAction, InAction, TimeRange, Datum } from 'plywood';

// Basically these represent
// expression.in(check) .not()?

export interface FilterClauseValue {
  expression: Expression;
  selection?: Expression;
  exclude?: boolean;
}

export interface FilterClauseJS {
  expression: ExpressionJS;
  selection?: ExpressionJS;
  exclude?: boolean;
}

function isLiteral(ex: Expression): boolean {
  if (ex instanceof LiteralExpression) return TimeRange.isTimeRange(ex.value) || Set.isSet(ex.value);
  return false;
}

function isRelative(ex: Expression): boolean {
  if (ex instanceof ChainExpression) {
    if (ex.type !== 'TIME_RANGE') return false;
    var expression = ex.expression;
    if (expression instanceof RefExpression) {
      return expression.name === FilterClause.NOW_REF_NAME || expression.name === FilterClause.MAX_TIME_REF_NAME;
    }
  }
  return false;
}

var check: Class<FilterClauseValue, FilterClauseJS>;
export class FilterClause implements Instance<FilterClauseValue, FilterClauseJS> {

  static isFilterClause(candidate: any): boolean {
    return isInstanceOf(candidate, FilterClause);
  }

  static NOW_REF_NAME = 'n';
  static MAX_TIME_REF_NAME = 'm';

  static evaluate(selection: Expression, now: Date, maxTime: Date, timezone: Timezone): TimeRange {
    if (!selection) return null;
    var maxTimeMinuteTop = minute.move(minute.floor(maxTime, timezone), timezone, 1);
    var datum: Datum = {};
    datum[FilterClause.NOW_REF_NAME] = now;
    datum[FilterClause.MAX_TIME_REF_NAME] = maxTimeMinuteTop;
    return selection.getFn()(datum, { timezone: timezone.toString() });
  }

  static fromExpression(ex: Expression): FilterClause {
    var exclude = false;
    if (ex.lastAction() instanceof NotAction) {
      ex = ex.popAction();
      exclude = true;
    }
    var lastAction = ex.lastAction();
    if (lastAction instanceof InAction) {
      return new FilterClause({
        expression: ex.popAction(),
        selection: lastAction.expression,
        exclude
      });
    }
    throw new Error(`invalid expression ${ex.toString()}`);
  }

  static fromJS(parameters: FilterClauseJS): FilterClause {
    var value: FilterClauseValue = {
      expression: Expression.fromJS(parameters.expression),
      selection: Expression.fromJS(parameters.selection),
      exclude: Boolean(parameters.exclude)
    };
    return new FilterClause(value);
  }


  public expression: Expression;
  public selection: Expression;
  public exclude: boolean;
  public relative: boolean;

  constructor(parameters: FilterClauseValue) {
    this.expression = parameters.expression;
    var selection = parameters.selection;
    if (isRelative(selection)) {
      this.relative = true;
    } else if (isLiteral(selection)) {
      this.relative = false;
    } else {
      throw new Error(`invalid expression ${selection.toString()}`);
    }
    this.selection = selection;
    this.exclude = parameters.exclude || false;
  }

  public valueOf(): FilterClauseValue {
    return {
      expression: this.expression,
      selection: this.selection,
      exclude: this.exclude
    };
  }

  public toJS(): FilterClauseJS {
    var js: FilterClauseJS = {
      expression: this.expression.toJS(),
      selection: this.selection.toJS(),
    };
    if (this.exclude) js.exclude = true;
    return js;
  }

  public toJSON(): FilterClauseJS {
    return this.toJS();
  }

  public toString(): string {
    return `[FilterClause: ${this.expression.toString()}]`;
  }

  public equals(other: FilterClause): boolean {
    return FilterClause.isFilterClause(other) &&
      this.expression.equals(other.expression) &&
      this.selection.equals(other.selection) &&
      this.exclude === other.exclude;
  }

  public toExpression(): ChainExpression {
    var selection = this.selection;
    var ex = this.expression.in(selection);
    if (this.exclude) ex = ex.not();
    return ex;
  }

  public getTimeRange(): TimeRange {
    if (this.relative) return null;
    var v = this.selection.getLiteralValue();
    return TimeRange.isTimeRange(v) ? v : null;
  }

  public getLiteralSet(): Set {
    if (this.relative) return null;
    var v = this.selection.getLiteralValue();
    return TimeRange.isTimeRange(v) ? Set.fromJS([v]) : v;
  }

  public changeSelection(selection: Expression) {
    var value = this.valueOf();
    value.selection = selection;
    return new FilterClause(value);
  }

  public evaluate(now: Date, maxTime: Date, timezone: Timezone): FilterClause {
    if (!this.relative) return this;
    return this.changeSelection(r(FilterClause.evaluate(this.selection, now, maxTime, timezone)));
  }
}
check = FilterClause;
